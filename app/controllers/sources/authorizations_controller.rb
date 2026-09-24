# OAuth heen en terug: new stuurt naar Microsoft of Atlassian, show is waar ze terugkomen.
class Sources::AuthorizationsController < ApplicationController
  before_action :set_source_class

  def new
    session[:oauth_state] = state = SecureRandom.urlsafe_base64(24)
    redirect_to @source_class.authorize_url(state: state, redirect_uri: callback_url), allow_other_host: true
  end

  def show
    if params[:error].present?
      redirect_to sources_path, alert: "Niet gekoppeld: #{params[:error_description] || params[:error]}"
    elsif params[:state].blank? || !ActiveSupport::SecurityUtils.secure_compare(params[:state], session.delete(:oauth_state).to_s)
      redirect_to sources_path, alert: "Koppeling verlopen, probeer het opnieuw."
    else
      source = @source_class.connect(code: params.expect(:code), redirect_uri: callback_url)
      redirect_to sources_path, notice: "#{source.title} gekoppeld als #{source.account}."
    end
  rescue Source::Requestable::Error => error
    redirect_to sources_path, alert: "Niet gekoppeld: #{error.message}"
  end

  private
    def set_source_class
      @source_class = Source.for(params[:provider])
      redirect_to sources_path, alert: "#{params[:provider].titleize} is nog niet ingesteld." unless @source_class&.configured?
    end

    def callback_url
      authorization_url(provider: params[:provider])
    end
end
