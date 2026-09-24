class Item::ClassifyJob < ApplicationJob
  def perform(item)
    item.classify
  end
end
