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

  test "an overlong proposal can still be accepted" do
    proposal = Proposal.create!(text: "Lang voorstel " * 30, sender: "Sophie")
    proposal.accept

    assert proposal.accepted?
    assert_includes proposal.item.note, proposal.text.squish
  end

  test "one decision per proposal" do
    proposal = proposals(:bitbucket)

    assert_difference -> { Item.count }, 1 do
      proposal.accept
      proposal.accept
    end

    proposal.dismiss
    assert_not proposal.reload.dismissed_at?
  end

  test "undo keeps an item that was already worked on" do
    proposal = proposals(:bitbucket)
    proposal.accept
    travel 1.minute
    proposal.item.complete

    assert_not proposal.undoable?
    assert_nil Proposal.last_decision

    proposal.undecide
    assert proposal.reload.accepted?
    assert Item.exists?(proposal.item.id)
  end
end
