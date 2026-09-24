class Items::RewritesController < ApplicationController
  include ItemScoped

  def create
    @item.rewrite_later params.expect(:instruction)
    redirect_to root_path
  end
end
