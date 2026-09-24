# Claude-projecten. claude.ai heeft geen gebruikers-API voor projecten, wel de Compliance API voor Enterprise.
# Met een compliance-sleutel halen we de projecten van Thomas op; zonder zet je per programma een link.
class Source::Claude < Source
  API = "https://api.anthropic.com/v1/compliance/apps/projects"

  validates :access_token, :account, presence: true

  def title
    "Claude"
  end

  private
    def fetch
      projects.select { |project| project.dig("user", "email_address")&.casecmp?(account) && project["deleted_at"].nil? }.map do |project|
        { kind: "project", external_id: project["id"], title: project["name"],
          url: "https://claude.ai/projects", starts_at: project["updated_at"] }
      end
    end

    def projects(page: nil)
      response = request(:get, API, query: { limit: 100, page: page }.compact,
        headers: { "x-api-key" => access_token, "anthropic-version" => "2023-06-01" })

      response.fetch("data") + (response["has_more"] && response["next_page"] ? projects(page: response["next_page"]) : [])
    end
end
