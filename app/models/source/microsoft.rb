# Outlook-mail, agenda, Teams-chats en PowerPoint uit OneDrive en SharePoint, via Microsoft Graph.
class Source::Microsoft < Source
  include Source::Authorizable

  GRAPH = "https://graph.microsoft.com/v1.0"

  class << self
    def scopes
      %w[ offline_access User.Read Mail.Read Calendars.Read Chat.Read Files.Read.All ]
    end

    private
      def tenant = setting(:tenant_id) || "organizations"
      def authorize_endpoint = "https://login.microsoftonline.com/#{tenant}/oauth2/v2.0/authorize"
      def token_endpoint = "https://login.microsoftonline.com/#{tenant}/oauth2/v2.0/token"
  end

  def title
    "Microsoft 365"
  end

  def identify
    me = graph("/me", { "$select" => "displayName,mail,userPrincipalName" })
    self.account = me["mail"].presence || me["userPrincipalName"]
  end

  private
    def fetch
      mails + events + chats + decks
    end

    # Ongelezen of gemarkeerd, van de afgelopen week. Gelezen mail zonder vlag verdwijnt bij de volgende sync.
    def mails
      graph("/me/mailFolders/inbox/messages",
        { "$filter" => "receivedDateTime ge #{7.days.ago.utc.iso8601}", "$orderby" => "receivedDateTime desc", "$top" => 50,
          "$select" => "id,subject,from,receivedDateTime,isRead,flag,webLink,bodyPreview,importance" })
        .fetch("value")
        .select { |mail| !mail["isRead"] || mail.dig("flag", "flagStatus") == "flagged" }
        .map do |mail|
          { kind: "mail", external_id: mail["id"], title: mail["subject"].presence || "(geen onderwerp)",
            summary: mail["bodyPreview"].to_s.squish.truncate(280), url: mail["webLink"],
            person: mail.dig("from", "emailAddress", "name"), starts_at: mail["receivedDateTime"],
            unread: !mail["isRead"], flagged: mail.dig("flag", "flagStatus") == "flagged" || mail["importance"] == "high" }
        end
    end

    def events
      graph("/me/calendarView",
        { startDateTime: Date.current.beginning_of_day.utc.iso8601, endDateTime: 7.days.from_now.end_of_day.utc.iso8601,
          "$orderby" => "start/dateTime", "$top" => 100,
          "$select" => "id,subject,start,end,location,organizer,webLink,onlineMeeting,isCancelled,showAs" },
        headers: { "Prefer" => %(outlook.timezone="UTC") })
        .fetch("value")
        .reject { |event| event["isCancelled"] || event["showAs"] == "free" }
        .map do |event|
          { kind: "event", external_id: event["id"], title: event["subject"].presence || "(geen onderwerp)",
            summary: event.dig("location", "displayName").presence, url: event.dig("onlineMeeting", "joinUrl") || event["webLink"],
            person: event.dig("organizer", "emailAddress", "name"), status: event["showAs"],
            starts_at: utc(event.dig("start", "dateTime")), ends_at: utc(event.dig("end", "dateTime")) }
        end
    end

    # Chats met het laatste bericht erbij. Delegated kan Graph niet alle berichten ineens geven, dit wel.
    def chats
      graph("/me/chats", { "$expand" => "lastMessagePreview", "$orderby" => "lastMessagePreview/createdDateTime desc", "$top" => 30 })
        .fetch("value")
        .select { |chat| chat["lastMessagePreview"] && chat.dig("lastMessagePreview", "createdDateTime").to_time.after?(7.days.ago) }
        .map do |chat|
          preview = chat["lastMessagePreview"]
          { kind: "chat", external_id: chat["id"], title: chat["topic"].presence || preview.dig("from", "user", "displayName") || "Chat",
            summary: ActionController::Base.helpers.strip_tags(preview.dig("body", "content")).to_s.squish.truncate(280),
            url: chat["webUrl"], person: preview.dig("from", "user", "displayName"), starts_at: preview["createdDateTime"] }
        end
    end

    # /me/drive/recent is uitgefaseerd; Microsoft Search vindt decks in OneDrive en SharePoint.
    def decks
      response = graph_post("/search/query", requests: [ {
        entityTypes: [ "driveItem" ], query: { queryString: "filetype:pptx" }, from: 0, size: 25,
        sortProperties: [ { name: "lastModifiedDateTime", isDescending: true } ] } ])

      Array(response.dig("value", 0, "hitsContainers", 0, "hits")).map do |hit|
        file = hit["resource"]
        { kind: "deck", external_id: file["id"], title: file["name"].to_s.delete_suffix(".pptx"),
          summary: ActionController::Base.helpers.strip_tags(hit["summary"]).to_s.squish.truncate(280).presence,
          url: file["webUrl"], person: file.dig("lastModifiedBy", "user", "displayName"), starts_at: file["lastModifiedDateTime"] }
      end
    end

    def graph(path, query = {}, headers: {})
      request :get, GRAPH + path, query: query, headers: authorized_headers.merge(headers)
    end

    def graph_post(path, body)
      request :post, GRAPH + path, json: body, headers: authorized_headers
    end

    def utc(time)
      Time.find_zone("UTC").parse(time) if time
    end
end
