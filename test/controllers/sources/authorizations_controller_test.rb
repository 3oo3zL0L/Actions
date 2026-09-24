require "test_helper"

class Sources::AuthorizationsControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:thomas)
    ENV["MICROSOFT_CLIENT_ID"], ENV["MICROSOFT_CLIENT_SECRET"] = "client", "secret"
  end

  teardown { ENV.delete("MICROSOFT_CLIENT_ID") && ENV.delete("MICROSOFT_CLIENT_SECRET") }

  test "off to Microsoft and back" do
    get new_authorization_path(provider: :microsoft)

    assert_response :redirect
    assert_match %r{\Ahttps://login.microsoftonline.com/organizations/oauth2/v2.0/authorize\?}, response.location
    state = Rack::Utils.parse_query(URI(response.location).query).fetch("state")

    with_responses Source::Microsoft,
      "oauth2/v2.0/token" => { "access_token" => "new", "refresh_token" => "r", "expires_in" => 3600 },
      "graph.microsoft.com/v1.0/me" => { "mail" => "thomas@planon.example" } do
      get authorization_path(provider: :microsoft), params: { code: "code", state: state }
    end

    assert_redirected_to sources_path
    assert_equal "new", sources(:microsoft).reload.access_token
  end

  test "a forged state is refused" do
    get new_authorization_path(provider: :microsoft)
    get authorization_path(provider: :microsoft), params: { code: "code", state: "forged" }

    assert_redirected_to sources_path
    assert_match "verlopen", flash[:alert]
  end

  test "not configured" do
    get new_authorization_path(provider: :atlassian)

    assert_redirected_to sources_path
    assert_match "nog niet ingesteld", flash[:alert]
  end
end
