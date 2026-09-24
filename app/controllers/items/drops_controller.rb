class Items::DropsController < ApplicationController
  include ItemScoped

  def create
    @item.drop
    redirect_back_or_to items_path
  end

  def destroy
    @item.reopen
    redirect_back_or_to items_path
  end
end
