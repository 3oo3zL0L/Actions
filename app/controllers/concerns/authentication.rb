module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_authentication
    helper_method :authenticated?
  end

  class_methods do
    def allow_unauthenticated_access(**options)
      skip_before_action :require_authentication, **options
    end

    # Voor de Cowork-ochtendrun: Authorization: Bearer <api_token>, alleen JSON en markdown.
    def allow_token_access(**options)
      skip_forgery_protection if: :token_request?, **options
    end
  end

  private
    def authenticated?
      resume_session
    end

    def require_authentication
      resume_session || authenticate_by_token || request_authentication
    end

    def resume_session
      Current.session ||= find_session_by_cookie
    end

    def find_session_by_cookie
      Session.find_by(id: cookies.signed[:session_id]) if cookies.signed[:session_id]
    end

    def authenticate_by_token
      if token_request?
        authenticate_with_http_token { |token| Current.api_user = User.find_by(api_token: token) }
      end
    end

    def token_request?
      request.authorization.to_s.start_with?("Bearer") && !request.format.html?
    end

    def request_authentication
      if request.format.html?
        session[:return_to_after_authenticating] = request.url
        redirect_to User.any? ? new_session_path : new_first_run_path
      else
        head :unauthorized
      end
    end

    def after_authentication_url
      session.delete(:return_to_after_authenticating) || root_url
    end

    def start_new_session_for(user)
      user.sessions.create!(user_agent: request.user_agent, ip_address: request.remote_ip).tap do |session|
        Current.session = session
        cookies.signed.permanent[:session_id] = { value: session.id, httponly: true, same_site: :lax }
      end
    end

    def terminate_session
      Current.session.destroy
      cookies.delete(:session_id)
    end
end
