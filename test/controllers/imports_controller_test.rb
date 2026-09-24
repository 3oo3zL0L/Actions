require "test_helper"

class ImportsControllerTest < ActionDispatch::IntegrationTest
  test "paste todos.md" do
    sign_in_as users(:thomas)

    get new_import_path
    assert_response :success

    assert_difference -> { Item.count }, 2 do
      post import_path, params: { markdown: "## OIDC\n- [ ] Scope bepalen | - | -\n- [ ] Reviewen | Krishna | 3 okt" }
    end

    assert_redirected_to root_path
    assert Program.exists?(name: "OIDC")
  end
end
