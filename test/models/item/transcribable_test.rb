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
end
