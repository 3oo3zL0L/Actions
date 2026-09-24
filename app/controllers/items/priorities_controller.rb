class Items::PrioritiesController < ApplicationController
  include ItemScoped

  def create
    @item.prioritize why: params[:why]
    redirect_to root_path
  end

  def destroy
    @item.deprioritize
    redirect_to root_path
  end
end
