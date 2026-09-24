require "test_helper"

class ProposalTest < ActiveSupport::TestCase
  test "accept puts it on the list under its program" do
    proposal = proposals(:bitbucket)
    proposal.accept

    assert proposal.accepted?
    assert_equal programs(:contracten), proposal.item.program
    assert_equal proposal.mail_url, proposal.item.mail_url
    assert_not_includes Proposal.pending, proposal
  end

  test "undo an acceptance removes the item again" do
    proposal = proposals(:bitbucket)
    proposal.accept
    item = proposal.item

    proposal.undecide

    assert_not Item.exists?(item.id)
    assert_includes Proposal.pending, proposal
  end

  test "last decision" do
    assert_nil Proposal.last_decision

    proposals(:bitbucket).dismiss
    assert_equal proposals(:bitbucket), Proposal.last_decision
  end
end
