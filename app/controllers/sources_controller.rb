# Koppelingen. Microsoft en Atlassian via OAuth, Claude met een compliance-sleutel.
class SourcesController < ApplicationController
  def index
    @sources = Source.all.index_by(&:provider)
  end

  def create
    source = Source::Claude.connected || Source::Claude.new
    if source.update(claude_params)
      source.sync_later
      redirect_to sources_path, notice: "Claude gekoppeld."
    else
      redirect_to sources_path, alert: "Vul een compliance-sleutel en je e-mailadres in."
    end
  end

  def destroy
    Source.find(params[:id]).destroy
    redirect_to sources_path, notice: "Ontkoppeld."
  end

  private
    def claude_params
      params.expect(source: %i[ access_token account ])
    end
end
