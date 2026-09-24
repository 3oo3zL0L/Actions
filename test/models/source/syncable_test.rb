require "test_helper"

class Source::SyncableTest < ActiveSupport::TestCase
  setup { @source = sources(:atlassian) }

  test "sync upserts what the source returns, assigns programs and prunes the rest" do
    @source.define_singleton_method(:fetch) do
      [ { kind: "epic", external_id: "PLAT-12", title: "Index Advisor v2", status: "In Progress" },
        { kind: "epic", external_id: "CTR-1", title: "Contracten 2027" },
        { kind: "page", external_id: "99", title: "Losse notitie" } ]
    end

    @source.sync

    assert_equal "Index Advisor v2", entries(:index_epic).reload.title
    assert_equal programs(:contracten), @source.entries.find_by(external_id: "CTR-1").program
    assert_nil @source.entries.find_by(external_id: "99").program
    assert_equal 3, @source.entries.count
    assert @source.synced?
    assert_nil @source.sync_error
  end

  test "a lost authorization is remembered, entries stay" do
    @source.define_singleton_method(:fetch) { raise Source::Requestable::Unauthorized, "401 op api.atlassian.com/me" }

    assert_no_changes -> { @source.entries.count } do
      @source.sync
    end
    assert_match "Opnieuw koppelen", @source.reload.sync_error
  end

  test "new sources sync right away" do
    assert_enqueued_with job: Source::SyncJob do
      Source::Claude.create!(access_token: "sk-ant-admin", account: "thomas@example.com")
    end
  end
end
