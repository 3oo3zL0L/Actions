require "test_helper"

class SourcesControllerTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:thomas) }

  test "index" do
    get sources_path

    assert_response :success
    assert_select "#microsoft ~ .chip", text: /bijgewerkt/
    assert_select "form[action=?]", sources_path
  end

  test "connect claude with a compliance key" do
    post sources_path, params: { source: { access_token: "sk-ant-admin", account: "thomas@planon.example" } }

    assert_redirected_to sources_path
    assert_equal "sk-ant-admin", Source::Claude.connected.access_token
  end

  test "disconnect" do
    assert_difference -> { Entry.count }, -2 do
      delete source_path(sources(:microsoft))
    end
  end

  test "refresh one" do
    assert_enqueued_with job: Source::SyncJob, args: [ sources(:atlassian) ] do
      post source_sync_path(sources(:atlassian))
    end
  end
end
