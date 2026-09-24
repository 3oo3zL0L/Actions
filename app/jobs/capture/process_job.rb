class Capture::ProcessJob < ApplicationJob
  def perform(capture)
    capture.process unless capture.processed_at?
  end
end
