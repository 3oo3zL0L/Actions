class Sources::SyncsController < ApplicationController
  def create
    Source.find(params[:source_id]).sync_later
    redirect_back_or_to sources_path, notice: "Wordt ververst."
  end
end
