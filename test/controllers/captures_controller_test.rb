require "test_helper"

class CapturesControllerTest < ActionDispatch::IntegrationTest
  test "typed lines go straight onto the list" do
    sign_in_as users(:thomas)

    assert_difference -> { Item.count }, 2 do
      post captures_path, params: { capture: { body: "Een\nTwee", spoken: false } }
    end

    assert_redirected_to root_path
    assert_equal "2 acties op de lijst.", flash[:notice]
  end

  test "spoken text is processed later" do
    sign_in_as users(:thomas)

    assert_no_difference -> { Item.count } do
      post captures_path, params: { capture: { body: "een en twee", spoken: true } }
    end

    assert_enqueued_jobs 1, only: Capture::ProcessJob
  end

  test "with a token" do
    assert_difference -> { Item.count } do
      post captures_path(format: :json), params: { capture: { body: "Via Cowork" } }, as: :json,
        headers: { "Authorization" => "Bearer token-for-the-morning-run" }
    end

    assert_response :created
  end
end
