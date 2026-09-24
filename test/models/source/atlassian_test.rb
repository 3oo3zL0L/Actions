require "test_helper"

class Source::AtlassianTest < ActiveSupport::TestCase
  test "epics from Jira and pages from Confluence" do
    with_responses Source::Atlassian,
      "/rest/api/3/search/jql" => ->(query:, **) {
        assert_match "issuetype = Epic", query[:jql]
        { "issues" => [ { "key" => "PLAT-12", "fields" => { "summary" => "Index Advisor", "status" => { "name" => "In Progress" },
          "project" => { "name" => "Platform" }, "assignee" => { "displayName" => "Santhosh" }, "updated" => "2026-09-23T10:00:00.000+0200" } } ] }
      },
      "/wiki/rest/api/search" => { "results" => [
        { "content" => { "id" => "123", "title" => "OIDC ontwerp" }, "url" => "/spaces/PAF/pages/123", "excerpt" => "@@@hl@@@OIDC@@@endhl@@@ flow",
          "lastModified" => "2026-09-22T09:00:00.000Z", "resultGlobalContainer" => { "title" => "PAF" } } ] } do
      sources(:atlassian).sync
    end

    epic = sources(:atlassian).entries.find_by!(external_id: "PLAT-12")
    assert_equal "https://planon.atlassian.net/browse/PLAT-12", epic.url
    assert_equal "In Progress", epic.status
    assert_equal programs(:platform_core), epic.program

    page = sources(:atlassian).entries.find_by!(kind: "page")
    assert_equal "https://planon.atlassian.net/wiki/spaces/PAF/pages/123", page.url
    assert_equal "OIDC flow", page.summary
  end

  test "connecting picks the site and the account" do
    with_responses Source::Atlassian,
      "oauth/token/accessible-resources" => [ { "id" => "cloud-2", "url" => "https://nieuw.atlassian.net" } ],
      "auth.atlassian.com/oauth/token" => { "access_token" => "a", "refresh_token" => "r", "expires_in" => 3600 },
      "api.atlassian.com/me" => { "email" => "thomas@planon.example" } do
      source = Source::Atlassian.connect(code: "code", redirect_uri: "https://werk.example/cb")

      assert_equal sources(:atlassian), source
      assert_equal "cloud-2", source.site_id
      assert_equal "https://nieuw.atlassian.net", source.site_url
    end
  end
end
