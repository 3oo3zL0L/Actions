class Items::CompletionsController < ApplicationController
  include ItemScoped

  def create
    @item.complete
    redirect_back_or_to items_path
  end

  def destroy
    @item.reopen
    redirect_back_or_to items_path
  end
end
