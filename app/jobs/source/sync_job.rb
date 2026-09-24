class Source::SyncJob < ApplicationJob
  limits_concurrency to: 1, key: ->(source) { source }, duration: 5.minutes

  def perform(source)
    source.sync
  end
end
