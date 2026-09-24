class Item::RewriteJob < ApplicationJob
  def perform(item)
    item.rewrite
  end
end
