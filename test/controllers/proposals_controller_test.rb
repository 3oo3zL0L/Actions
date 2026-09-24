require "test_helper"

class ProposalsControllerTest < ActionDispatch::IntegrationTest
  test "the morning run drops proposals" do
    assert_difference -> { Proposal.pending.count } do
      post proposals_path(format: :json), as: :json,
        params: { proposal: { text: "Status teruggeven op contract", sender: "Sophie", program_name: "Contracten" } },
        headers: { "Authorization" => "Bearer token-for-the-morning-run" }
    end

    assert_response :created
  end

  test "not without a token" do
    post proposals_path(format: :json), as: :json, params: { proposal: { text: "x" } }
    assert_response :unauthorized
  end
end
