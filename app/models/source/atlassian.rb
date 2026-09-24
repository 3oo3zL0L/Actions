# Jira op epicniveau en Confluence-pagina's waar Thomas aan werkt of die hij volgt.
class Source::Atlassian < Source
  include Source::Authorizable

  API = "https://api.atlassian.com"
  EPICS = ENV.fetch("JIRA_EPIC_JQL", "issuetype = Epic AND statusCategory != Done ORDER BY updated DESC")
  PAGES = ENV.fetch("CONFLUENCE_CQL", "type = page AND (contributor = currentUser() OR watcher = currentUser()) ORDER BY lastmodified DESC")

  class << self
    def scopes
      %w[ read:jira-work read:jira-user search:confluence read:confluence-content.summary read:me offline_access ]
    end

    private
      def authorize_endpoint = "https://auth.atlassian.com/authorize"
      def token_endpoint = "https://auth.atlassian.com/oauth/token"
      def extra_authorize_params = { audience: "api.atlassian.com", prompt: "consent" }
  end

  # Een token kan bij meerdere sites; we nemen de eerste met Jira, of ATLASSIAN_SITE als die is gezet.
  def identify
    sites = request(:get, "#{API}/oauth/token/accessible-resources", headers: authorized_headers)
    site = sites.find { |candidate| candidate["url"] == self.class.setting(:site) } || sites.first
    raise Source::Requestable::Error, "Geen Atlassian-site gevonden bij dit account" unless site

    self.site_id, self.site_url = site.values_at("id", "url")
    self.account = request(:get, "#{API}/me", headers: authorized_headers)["email"]
  end

  private
    def fetch
      epics + pages
    end

    def epics
      issues = request(:get, "#{API}/ex/jira/#{site_id}/rest/api/3/search/jql", headers: authorized_headers,
        query: { jql: EPICS, maxResults: 100, fields: "summary,status,assignee,updated,project,duedate" }).fetch("issues")

      issues.map do |issue|
        fields = issue["fields"]
        { kind: "epic", external_id: issue["key"], title: fields["summary"], summary: [ issue["key"], fields.dig("project", "name") ].compact.join(" · "),
          url: "#{site_url}/browse/#{issue["key"]}", person: fields.dig("assignee", "displayName"),
          status: fields.dig("status", "name"), starts_at: fields["updated"], ends_at: fields["duedate"] }
      end
    end

    def pages
      results = request(:get, "#{API}/ex/confluence/#{site_id}/wiki/rest/api/search", headers: authorized_headers,
        query: { cql: PAGES, limit: 50 }).fetch("results")

      results.map do |result|
        { kind: "page", external_id: result.dig("content", "id") || result["url"], title: result.dig("content", "title") || result["title"],
          summary: result["excerpt"].to_s.gsub(/@@@(end)?hl@@@/, "").squish.truncate(280).presence,
          url: "#{site_url}/wiki#{result["url"]}", person: result.dig("resultGlobalContainer", "title"), starts_at: result["lastModified"] }
      end
    end
end
