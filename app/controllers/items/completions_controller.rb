class Items::CompletionsController < ApplicationController
  include ItemScoped

  def create
    @item.complete
    redirect_to root_path
  end

  def destroy
    @item.reopen
    redirect_to root_path
  end
end
