require "test_helper"

class Source::ClaudeTest < ActiveSupport::TestCase
  test "only the projects of Thomas, across pages" do
    source = Source::Claude.new(access_token: "sk-ant-admin", account: "Thomas@planon.example")
    source.save!

    pages = {
      nil => { "data" => [ project("claude_proj_1", "OIDC", "thomas@planon.example") ], "has_more" => true, "next_page" => "p2" },
      "p2" => { "data" => [ project("claude_proj_2", "Iemand anders", "kim@planon.example"),
                            project("claude_proj_3", "Weg", "thomas@planon.example", deleted_at: "2026-09-01T00:00:00Z") ], "has_more" => false }
    }

    with_responses Source::Claude, "compliance/apps/projects" => ->(query:, headers:, **) {
      assert_equal "sk-ant-admin", headers["x-api-key"]
      pages.fetch(query[:page])
    } do
      source.sync
    end

    assert_equal [ "OIDC" ], source.entries.pluck(:title)
  end

  private
    def project(id, name, email, deleted_at: nil)
      { "id" => id, "name" => name, "updated_at" => "2026-09-20T10:00:00Z", "deleted_at" => deleted_at, "user" => { "email_address" => email } }
    end
end
