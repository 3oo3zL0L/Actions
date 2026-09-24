require "test_helper"

class Item::RewritableTest < ActiveSupport::TestCase
  test "rewrites by instruction" do
    revision = { "text" => "JProfiler-licentie verlengen", "who" => "Santhosh", "due_on" => "2026-10-01", "note" => "", "program" => "Contracten" }

    with_assistant rewrite: revision do
      items(:jprofiler).rewrite_later "Santhosh erbij, deadline 1 okt"
      assert items(:jprofiler).rewriting?

      perform_enqueued_jobs only: Item::RewriteJob
    end

    items(:jprofiler).reload
    assert_not items(:jprofiler).rewriting?
    assert_equal "Santhosh", items(:jprofiler).who
    assert_equal Date.new(2026, 10, 1), items(:jprofiler).due_on
  end

  test "without assistant the instruction is kept as a note" do
    items(:jprofiler).rewrite_later "Eerst budget checken"
    perform_enqueued_jobs only: Item::RewriteJob

    assert_equal "Eerst budget checken", items(:jprofiler).reload.note
  end
end
