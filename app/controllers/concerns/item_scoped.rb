module ItemScoped
  extend ActiveSupport::Concern

  included do
    before_action :set_item
  end

  private
    def set_item
      @item = Item.find(params[:item_id])
    end
end
