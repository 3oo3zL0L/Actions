require "test_helper"

class ApplicationHelperTest < ActionView::TestCase
  test "due dates read like you would say them" do
    assert_equal "vandaag", due_label(Item.new(due_on: Date.current))
    assert_equal "morgen", due_label(Item.new(due_on: Date.tomorrow))
    assert_equal "verlopen · gisteren", due_label(Item.new(due_on: Date.yesterday))
    assert_equal "verlopen · 3 dagen", due_label(Item.new(due_on: 3.days.ago.to_date))
    assert_equal I18n.l(3.days.from_now.to_date, format: "%A").downcase, due_label(Item.new(due_on: 3.days.from_now.to_date))
    assert_equal I18n.l(3.weeks.from_now.to_date, format: :short), due_label(Item.new(due_on: 3.weeks.from_now.to_date))
  end

  test "initials" do
    assert_equal "SK", initials("Santhosh Kumar")
    assert_equal "K", initials("Kim")
  end
end
