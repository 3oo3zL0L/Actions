require "test_helper"

class ProgramsControllerTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:thomas) }

  test "index and show" do
    get programs_path
    assert_select ".program", text: /Platform Core/

    get program_path(programs(:platform_core))
    assert_response :success
    assert_select ".entry", text: /Index Advisor/
    assert_select ".item", text: /Index Advisor/
  end

  test "new keywords resync the sources" do
    assert_enqueued_jobs 2, only: Source::SyncJob do
      patch program_path(programs(:contracten)), params: { program: { keywords: "JProfiler, Bitbucket", claude_url: "https://claude.ai/project/abc" } }
    end

    assert_redirected_to program_path(programs(:contracten))
    assert_equal "https://claude.ai/project/abc", programs(:contracten).reload.claude_url
  end

  test "a claude link must be a link" do
    patch program_path(programs(:contracten)), params: { program: { claude_url: "javascript:alert(1)" } }
    assert_response :unprocessable_entity
  end
end
