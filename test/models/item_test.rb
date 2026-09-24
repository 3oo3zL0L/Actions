require "test_helper"

class ItemTest < ActiveSupport::TestCase
  test "normalizes text and who" do
    item = Item.new(text: "  Contract   verlengen. ", who: " ")

    assert_equal "Contract verlengen", item.text
    assert_equal Item::OWN, item.who
  end

  test "late only while active and past due" do
    assert items(:snapshot).late?
    assert_not items(:jprofiler).late?

    items(:snapshot).complete
    assert_not items(:snapshot).late?
  end

  test "only accepts https mail links" do
    assert_not Item.new(text: "x", mail_url: "javascript:alert(1)").valid?
  end

  test "writes itself as a todos.md line" do
    assert_equal "- [ ] JProfiler-licentie verlengen | Kim | #{I18n.l(items(:jprofiler).due_on, format: :short)}", items(:jprofiler).to_markdown
    assert_equal "- [ ] Snapshot invullen | eigen actie | #{I18n.l(2.weeks.ago.to_date, format: :short)}", items(:snapshot).to_markdown
  end

  test "changes broadcast a page refresh" do
    assert_enqueued_jobs 1, only: Turbo::Streams::BroadcastStreamJob do
      items(:jprofiler).update!(who: "Reinier")
    end
  end

  test "an overlong action is shortened and keeps its full text in the note" do
    long = "Lang " * 80
    item = Item.create!(text: long, note: "Van Sophie")

    assert_operator item.text.length, :<=, Item::MAX_TEXT
    assert_equal "#{long.squish.delete_suffix(".")}\nVan Sophie", item.note
  end
end
