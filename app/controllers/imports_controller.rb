# Eenmalig overzetten vanuit /areas/todos.md: plak de markdown, klaar.
class ImportsController < ApplicationController
  allow_token_access

  def new
  end

  def create
    items = Item.import_markdown(params.expect(:markdown))

    respond_to do |format|
      format.html { redirect_to root_path, notice: "#{helpers.pluralize(items.size, "actie", plural: "acties")} overgezet." }
      format.json { render json: { items: items.map(&:id) }, status: :created }
    end
  end
end
