class Items::DropsController < ApplicationController
  include ItemScoped

  def create
    @item.drop
    redirect_to root_path
  end

  def destroy
    @item.reopen
    redirect_to root_path
  end
end
