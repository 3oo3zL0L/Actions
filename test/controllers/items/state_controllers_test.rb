require "test_helper"

class Items::StateControllersTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:thomas)
    @item = items(:jprofiler)
  end

  test "complete and reopen" do
    post item_completion_path(@item)
    assert @item.reload.completed?

    delete item_completion_path(@item)
    assert @item.reload.active?
  end

  test "drop and undrop" do
    post item_drop_path(@item)
    assert @item.reload.dropped?

    delete item_drop_path(@item)
    assert @item.reload.active?
  end

  test "prioritize and deprioritize" do
    post item_priority_path(@item)
    assert @item.reload.prioritized?

    delete item_priority_path(@item)
    assert_not @item.reload.prioritized?
  end

  test "rewrite" do
    post item_rewrite_path(@item), params: { instruction: "Kim is met verlof, Sander pakt het op" }

    assert_redirected_to items_path
    assert_enqueued_with job: Item::RewriteJob, args: [ @item ]
  end
end
