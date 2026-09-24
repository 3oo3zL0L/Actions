require "test_helper"

class Entry::ActionableTest < ActiveSupport::TestCase
  test "an entry becomes an action with a link back" do
    item = entries(:index_epic).create_action

    assert_equal "Index Advisor", item.text
    assert_equal programs(:platform_core), item.program
    assert_equal "jira", item.source
    assert_equal "https://planon.atlassian.net/browse/PLAT-12", item.mail_url
    assert entries(:index_epic).reload.actioned?
  end

  test "without a program the action is classified as usual" do
    item = entries(:sander_mail).create_action

    assert_equal programs(:overig), item.program
    assert_equal "Sander", item.note
  end
end
