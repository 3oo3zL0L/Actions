require "test_helper"

class Item::TranscribableTest < ActiveSupport::TestCase
  test "imports todos.md" do
    markdown = <<~MD
      # Actielijst

      ## Contracten
      - [ ] JProfiler-licentie verlengen | Kim | 1 okt
      - [ ] Bitbucket opzeggen | - | voor Q4-plan

      ## Nieuw programma
      - [ ] Kick-off plannen
      - [x] Al gedaan | Kim | -
    MD

    items = Item.import_markdown(markdown)

    assert_equal [ "JProfiler-licentie verlengen", "Bitbucket opzeggen", "Kick-off plannen" ], items.map(&:text)
    assert_equal programs(:contracten), items.first.program
    assert_equal "Kim", items.first.who
    assert_equal 10, items.first.due_on.month
    assert_equal "Deadline: voor Q4-plan", items.second.note
    assert_equal "Nieuw programma", items.third.program.name
  end

  test "parses dutch and iso dates" do
    assert_equal Date.new(Date.current.year, 3, 8), Item.parse_due("8 mrt")
    assert_equal Date.new(2026, 9, 8), Item.parse_due("8 september 2026")
    assert_equal Date.new(2026, 12, 1), Item.parse_due("2026-12-01")
    assert_nil Item.parse_due("voor indienen Q4-plan")
    assert_nil Item.parse_due("-")
  end

  test "round trip keeps the year of a deadline in another year" do
    item = Item.create!(text: "Volgend jaar", due_on: Date.new(Date.current.year + 1, 1, 15))

    assert_equal item.due_on, Item.import_markdown("## Overig\n#{item.to_markdown}").first.due_on
  end

  test "round trip survives a pipe in the text" do
    item = Item.create!(text: "Build | deploy nalopen", who: "Kim")

    assert_equal "Build / deploy nalopen", Item.import_markdown("## Overig\n#{item.to_markdown}").first.text
  end

  test "the title of the file is not a program" do
    Item.import_markdown("# To do's\n\n## Contracten\n- [] Iets")

    assert_not Program.exists?(name: "To do's")
    assert Item.exists?(text: "Iets", program: programs(:contracten))
  end

  test "import is all or nothing" do
    assert_no_difference -> { Item.count } do
      assert_raises(ActiveRecord::RecordInvalid) { Item.import_markdown("## Overig\n- [ ] Goed | - | -\n- [ ] . | - | -") }
    end
  end
end
