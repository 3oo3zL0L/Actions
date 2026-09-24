require "test_helper"

class FirstRunsControllerTest < ActionDispatch::IntegrationTest
  test "creates the only account" do
    User.delete_all

    get new_first_run_path
    assert_response :success

    post first_run_path, params: { user: { email_address: "thomas@example.com", password: "geheim123" } }
    assert_redirected_to root_url
    assert cookies[:session_id]
  end

  test "only once" do
    get new_first_run_path
    assert_redirected_to root_url
  end
end
