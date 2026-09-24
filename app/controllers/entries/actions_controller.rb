class Entries::ActionsController < ApplicationController
  def create
    entry = Entry.find(params[:entry_id])
    entry.create_action unless entry.actioned?

    redirect_back_or_to root_path, notice: "#{entry.title} staat op de lijst."
  end
end
