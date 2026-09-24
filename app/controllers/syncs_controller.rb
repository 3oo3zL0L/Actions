class SyncsController < ApplicationController
  def create
    Source.sync_all_later
    redirect_back_or_to root_path, notice: "Alle bronnen worden ververst."
  end
end
