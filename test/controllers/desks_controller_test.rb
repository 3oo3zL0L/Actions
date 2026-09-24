require "test_helper"

class DesksControllerTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:thomas) }

  test "the desk shows today across sources" do
    get root_path

    assert_response :success
    assert_select "section[aria-labelledby=agenda] .entry", text: /Platform Core standup/
    assert_select ".entry--unread", text: /Verzoek om akkoord/
    assert_select ".card--today .item", text: /Index Advisor/
    assert_select "section[aria-labelledby=late] .item", text: /Snapshot invullen/
  end

  test "an entry becomes an action" do
    assert_difference -> { Item.count } do
      post entry_action_path(entries(:sander_mail))
    end

    assert_redirected_to root_path
    assert entries(:sander_mail).reload.actioned?
  end

  test "refresh all sources" do
    assert_enqueued_jobs 2, only: Source::SyncJob do
      post sync_path
    end
  end
end
