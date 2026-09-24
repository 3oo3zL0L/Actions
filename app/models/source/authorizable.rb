# OAuth 2.0 authorization code flow met refresh tokens, voor Microsoft en Atlassian.
module Source::Authorizable
  extend ActiveSupport::Concern

  class_methods do
    def configured?
      client_id.present? && client_secret.present?
    end

    def authorize_url(state:, redirect_uri:)
      "#{authorize_endpoint}?" + { client_id: client_id, response_type: "code", redirect_uri: redirect_uri,
        scope: scopes.join(" "), state: state }.merge(extra_authorize_params).to_query
    end

    def connect(code:, redirect_uri:)
      tokens = request_tokens(grant_type: "authorization_code", code: code, redirect_uri: redirect_uri)

      (connected || new).tap do |source|
        source.store_tokens tokens
        source.identify
        source.save!
      end
    end

    def request_tokens(**params)
      request :post, token_endpoint, form: params.merge(client_id: client_id, client_secret: client_secret)
    end

    def client_id = setting(:client_id)
    def client_secret = setting(:client_secret)

    private
      def extra_authorize_params = {}
  end

  def access_token!
    refresh if expires_at.nil? || expires_at.before?(1.minute.from_now)
    access_token
  end

  def store_tokens(tokens)
    self.access_token = tokens.fetch("access_token")
    self.refresh_token = tokens["refresh_token"] if tokens["refresh_token"].present?
    self.expires_at = tokens.fetch("expires_in", 3600).to_i.seconds.from_now
  end

  private
    def refresh
      raise Source::Requestable::Unauthorized, "geen refresh token" if refresh_token.blank?

      store_tokens self.class.request_tokens(grant_type: "refresh_token", refresh_token: refresh_token)
      save!
    rescue Source::Requestable::Error => error
      raise Source::Requestable::Unauthorized, error.message
    end

    def authorized_headers
      { "Authorization" => "Bearer #{access_token!}" }
    end
end
