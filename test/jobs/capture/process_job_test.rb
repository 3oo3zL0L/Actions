require "test_helper"

class Capture::ProcessJobTest < ActiveJob::TestCase
  test "a retried job does not put the same actions on the list twice" do
    capture = Capture.create!(body: "Rogier bellen", spoken: true)

    assert_difference -> { Item.count }, 1 do
      2.times { Capture::ProcessJob.perform_now(capture.reload) }
    end
  end
end
