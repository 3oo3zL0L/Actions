require "test_helper"

class Source::AuthorizableTest < ActiveSupport::TestCase
  test "an expired token is refreshed and a rotated refresh token kept" do
    source = sources(:atlassian)
    source.update!(expires_at: 1.minute.ago)

    with_responses Source::Atlassian, "auth.atlassian.com/oauth/token" => ->(form:, **) {
      assert_equal "refresh_token", form[:grant_type]
      assert_equal "atlassian-refresh", form[:refresh_token]
      { "access_token" => "fresh", "refresh_token" => "rotated", "expires_in" => 3600 }
    } do
      assert_equal "fresh", source.access_token!
    end

    assert_equal "rotated", source.reload.refresh_token
    assert source.expires_at.future?
  end

  test "a refused refresh means reconnecting" do
    source = sources(:microsoft)
    source.update!(expires_at: 1.minute.ago)

    with_responses Source::Microsoft, "oauth2/v2.0/token" => ->(**) { raise Source::Requestable::Error, "400 invalid_grant" } do
      assert_raises(Source::Requestable::Unauthorized) { source.access_token! }
    end
  end

  test "authorize url asks for read-only scopes and offline access" do
    url = with_env("ATLASSIAN_CLIENT_ID" => "abc") { Source::Atlassian.authorize_url(state: "s", redirect_uri: "https://werk.example/cb") }

    assert_match "audience=api.atlassian.com", url
    assert_match "read%3Ajira-work", url
    assert_match "offline_access", url
    assert_match "state=s", url
  end

  private
    def with_env(values)
      old = values.keys.index_with { |key| ENV[key] }
      values.each { |key, value| ENV[key] = value }
      yield
    ensure
      old.each { |key, value| ENV[key] = value }
    end
end
