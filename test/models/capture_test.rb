require "test_helper"

class CaptureTest < ActiveSupport::TestCase
  test "typed: one action per line" do
    items = Capture.create!(body: "Snapshot Paul nalopen\n\n  Targets Reinier doorkijken  ").process

    assert_equal [ "Snapshot Paul nalopen", "Targets Reinier doorkijken" ], items.map(&:text)
    assert items.all? { |item| item.source == "klad" }
  end

  test "spoken: split by the assistant in the background" do
    actions = [
      { "text" => "Rogier bellen", "program" => "Overig", "who" => "prive", "due_on" => nil },
      { "text" => "Licentie JProfiler checken", "program" => "Contracten", "who" => "eigen actie", "due_on" => "2026-10-01" }
    ]

    with_assistant split: actions do
      capture = Capture.create!(body: "rogier bellen en licentie jprofiler checken voor 1 oktober", spoken: true)

      assert_difference -> { Item.count }, 2 do
        perform_enqueued_jobs only: Capture::ProcessJob
      end

      assert capture.reload.processed_at?
      assert_equal programs(:contracten), Item.find_by(text: "Licentie JProfiler checken").program
      assert_equal "spraak", Item.last.source
    end
  end

  test "spoken without assistant falls back to lines" do
    Capture.create!(body: "rogier bellen", spoken: true)

    assert_difference -> { Item.count }, 1 do
      perform_enqueued_jobs only: Capture::ProcessJob
    end
  end
end
