require "test_helper"

class ItemsControllerTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:thomas) }

  test "index groups today, programs and closed" do
    get root_path

    assert_response :success
    assert_select ".card--today .item", text: /Index Advisor/
    assert_select "h2", text: "Contracten"
    assert_select "h2", text: "Vandaag afgerond"
    assert_select ".chip--late", text: /verlopen/
    assert_select ".proposal", text: /Bitbucket/
  end

  test "index as markdown for the morning run" do
    get items_path(format: :md), headers: { "Authorization" => "Bearer token-for-the-morning-run" }

    assert_response :success
    assert_includes response.body, "## Contracten"
    assert_includes response.body, "- [ ] JProfiler-licentie verlengen | Kim |"
    assert_not_includes response.body, "Targets doorkijken"
  end

  test "edit and update" do
    get edit_item_path(items(:jprofiler))
    assert_response :success

    patch item_path(items(:jprofiler)), params: { item: { who: "Santhosh", program_id: programs(:platform_core).id } }

    assert_redirected_to root_path
    assert_equal "Santhosh", items(:jprofiler).reload.who
    assert_equal programs(:platform_core), items(:jprofiler).program
  end

  test "update with invalid data" do
    patch item_path(items(:jprofiler)), params: { item: { text: "" } }

    assert_response :unprocessable_entity
  end
end

class ItemsControllerWithoutSessionTest < ActionDispatch::IntegrationTest
  test "html goes to sign in" do
    get root_path
    assert_redirected_to new_session_path
  end

  test "first visitor creates the account" do
    User.delete_all

    get root_path
    assert_redirected_to new_first_run_path
  end

  test "a wrong token is refused" do
    get items_path(format: :md), headers: { "Authorization" => "Bearer nope" }
    assert_response :unauthorized
  end

  test "a token does not open the html app" do
    get root_path, headers: { "Authorization" => "Bearer token-for-the-morning-run" }
    assert_redirected_to new_session_path
  end

  test "a manual edit counts as classified" do
    sign_in_as users(:thomas)
    item = items(:jprofiler)
    item.update_column :classified, false

    patch item_path(item), params: { item: { who: "Santhosh" } }

    assert item.reload.classified?
  end
end
