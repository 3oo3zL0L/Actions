class Items::PrioritiesController < ApplicationController
  include ItemScoped

  def create
    @item.prioritize why: params[:why]
    redirect_back_or_to items_path
  end

  def destroy
    @item.deprioritize
    redirect_back_or_to items_path
  end
end
