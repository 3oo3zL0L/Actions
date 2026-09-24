require "test_helper"

class Source::MicrosoftTest < ActiveSupport::TestCase
  test "mail, agenda, chats and decks from Graph" do
    with_responses Source::Microsoft, graph do
      sources(:microsoft).sync
    end

    entries = sources(:microsoft).entries.index_by(&:external_id)

    assert_equal %w[ chat-1 deck-1 evt-2 mail-2 mail-3 ], entries.keys.sort
    assert entries["mail-2"].unread?
    assert entries["mail-3"].flagged?
    assert_equal "Sophie", entries["mail-2"].person

    event = entries["evt-2"]
    assert_equal "https://teams.microsoft.com/l/meetup-join/2", event.url
    assert_equal Time.utc(2026, 9, 24, 8, 30), event.starts_at
    assert_equal programs(:platform_core), event.program

    assert_equal "Klopt, PLAT-12 schuift", entries["chat-1"].summary
    assert_equal "Roadmap Q4", entries["deck-1"].title
  end

  private
    def graph
      {
        "/me/mailFolders/inbox/messages" => { "value" => [
          { "id" => "mail-2", "subject" => "Status contract", "isRead" => false, "from" => { "emailAddress" => { "name" => "Sophie" } },
            "receivedDateTime" => 1.hour.ago.iso8601, "webLink" => "https://outlook.office365.com/owa/?ItemID=2", "flag" => { "flagStatus" => "notFlagged" } },
          { "id" => "mail-3", "subject" => "Budget", "isRead" => true, "flag" => { "flagStatus" => "flagged" }, "receivedDateTime" => 2.days.ago.iso8601 },
          { "id" => "mail-4", "subject" => "Nieuwsbrief", "isRead" => true, "flag" => { "flagStatus" => "notFlagged" }, "receivedDateTime" => 2.days.ago.iso8601 } ] },
        "/me/calendarView" => { "value" => [
          { "id" => "evt-2", "subject" => "Platform Core review", "start" => { "dateTime" => "2026-09-24T08:30:00.0000000" },
            "end" => { "dateTime" => "2026-09-24T09:00:00.0000000" }, "onlineMeeting" => { "joinUrl" => "https://teams.microsoft.com/l/meetup-join/2" },
            "organizer" => { "emailAddress" => { "name" => "Rogier" } }, "showAs" => "busy" },
          { "id" => "evt-3", "subject" => "Geannuleerd", "isCancelled" => true, "start" => {}, "end" => {} } ] },
        "/me/chats" => { "value" => [
          { "id" => "chat-1", "topic" => nil, "webUrl" => "https://teams.microsoft.com/l/chat/1",
            "lastMessagePreview" => { "createdDateTime" => 1.hour.ago.iso8601, "from" => { "user" => { "displayName" => "Santhosh" } },
              "body" => { "content" => "<p>Klopt, PLAT-12 schuift</p>" } } },
          { "id" => "chat-2", "topic" => "Oud", "lastMessagePreview" => { "createdDateTime" => 1.month.ago.iso8601, "body" => {} } } ] },
        "/search/query" => { "value" => [ { "hitsContainers" => [ { "hits" => [
          { "summary" => "Plannen voor <c0>Q4</c0>", "resource" => { "id" => "deck-1", "name" => "Roadmap Q4.pptx",
            "webUrl" => "https://planon.sharepoint.com/deck-1", "lastModifiedDateTime" => 1.day.ago.iso8601 } } ] } ] } ] }
      }
    end
end
