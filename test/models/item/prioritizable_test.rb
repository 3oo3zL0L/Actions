require "test_helper"

class Item::PrioritizableTest < ActiveSupport::TestCase
  test "prioritize puts it on today with a reason" do
    items(:jprofiler).prioritize why: "Kim is er vandaag"

    assert items(:jprofiler).prioritized?
    assert_equal "Kim is er vandaag", items(:jprofiler).why
    assert_includes Item.prioritized, items(:jprofiler)
  end

  test "deprioritize forgets the reason" do
    items(:index_advisor).deprioritize

    assert_not items(:index_advisor).prioritized?
    assert_nil items(:index_advisor).why
  end
end
