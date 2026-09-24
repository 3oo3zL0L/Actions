require "test_helper"

class ApplicationHelperTest < ActionView::TestCase
  test "deadlines read as distance to today" do
    today = Date.new(2026, 9, 24)

    assert_equal "3 dagen verlopen", due_label(today - 3, today: today)
    assert_equal "1 dag verlopen", due_label(today - 1, today: today)
    assert_equal "vandaag", due_label(today, today: today)
    assert_equal "morgen", due_label(today + 1, today: today)
    assert_equal "za", due_label(today + 2, today: today)
    assert_equal "8 okt", due_label(today + 14, today: today)
  end
end
