require "test_helper"

class Item::CloseableTest < ActiveSupport::TestCase
  test "complete, drop and reopen" do
    item = items(:jprofiler)

    item.complete
    assert item.completed?
    assert_not item.active?

    item.drop
    assert item.dropped?
    assert_not item.completed?

    item.reopen
    assert item.active?
  end

  test "closed today" do
    assert_includes Item.closed_today, items(:done)
    assert_not_includes Item.closed_today, items(:ancient)
    assert_not_includes Item.closed_today, items(:jprofiler)
  end

  test "sweep removes what has been closed for two weeks" do
    ancient, done = items(:ancient), items(:done)

    Item.sweep

    assert_not Item.exists?(ancient.id)
    assert Item.exists?(done.id)
  end
end
