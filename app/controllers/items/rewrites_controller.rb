class Items::RewritesController < ApplicationController
  include ItemScoped

  def create
    @item.rewrite_later params.expect(:instruction)
    redirect_to items_path
  end
end
