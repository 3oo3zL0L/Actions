require "test_helper"

class Item::RewriteJobTest < ActiveJob::TestCase
  test "a busy assistant is retried instead of losing the instruction" do
    items(:jprofiler).update! pending_instruction: "Santhosh erbij"
    busy = Anthropic::Errors::RateLimitError.allocate

    Assistant.define_singleton_method(:rewrite) { |*| raise busy }
    assert_enqueued_with job: Item::RewriteJob do
      Item::RewriteJob.perform_now(items(:jprofiler))
    end

    assert_equal "Santhosh erbij", items(:jprofiler).reload.pending_instruction
  ensure
    Assistant.singleton_class.remove_method(:rewrite)
  end
end
