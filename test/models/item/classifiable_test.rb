require "test_helper"

class Item::ClassifiableTest < ActiveSupport::TestCase
  test "without assistant a new action lands under Overig, done" do
    item = Item.create!(text: "Bitbucket-licentie opzeggen")

    assert_equal programs(:overig), item.program
    assert item.classified?
    assert_no_enqueued_jobs only: Item::ClassifyJob
  end

  test "with assistant it is classified in the background" do
    with_assistant classify: { "program" => "Contracten", "who" => "Sander", "due_on" => "2026-10-01" } do
      item = Item.create!(text: "Sander akkoord geven op Bitbucket voor 1 okt")
      assert_not item.classified?

      perform_enqueued_jobs only: Item::ClassifyJob
      item.reload

      assert item.classified?
      assert_equal programs(:contracten), item.program
      assert_equal "Sander", item.who
      assert_equal Date.new(2026, 10, 1), item.due_on
    end
  end

  test "an unknown program falls back to Overig" do
    with_assistant classify: { "program" => "Verzonnen", "who" => "eigen actie", "due_on" => nil } do
      item = Item.create!(text: "Iets")
      perform_enqueued_jobs only: Item::ClassifyJob

      assert_equal programs(:overig), item.reload.program
    end
  end

  test "a failed classification still counts as done" do
    with_assistant classify: nil do
      item = Item.create!(text: "Iets")
      perform_enqueued_jobs only: Item::ClassifyJob

      assert item.reload.classified?
    end
  end

  test "a manual edit before classification is not overwritten" do
    with_assistant classify: { "program" => "Contracten", "who" => "eigen actie", "due_on" => nil } do
      item = Item.create!(text: "Kim bellen")
      item.update!(who: "Kim", classified: true)
      perform_enqueued_jobs only: Item::ClassifyJob

      assert_equal "Kim", item.reload.who
      assert_equal programs(:overig), item.program
    end
  end
end
