require "test_helper"

class Proposals::DecisionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:thomas)
    @proposal = proposals(:bitbucket)
  end

  test "accept and undo" do
    assert_difference -> { Item.count } do
      post proposal_acceptance_path(@proposal)
    end
    assert @proposal.reload.accepted?

    assert_difference -> { Item.count }, -1 do
      delete proposal_acceptance_path(@proposal)
    end
    assert_includes Proposal.pending, @proposal
  end

  test "dismiss and undo" do
    post proposal_dismissal_path(@proposal)
    assert_not_includes Proposal.pending, @proposal

    get root_path
    assert_select ".undo", text: /is weg/

    delete proposal_dismissal_path(@proposal)
    assert_includes Proposal.pending, @proposal
  end
end
