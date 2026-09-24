module ProposalScoped
  extend ActiveSupport::Concern

  included do
    before_action :set_proposal
  end

  private
    def set_proposal
      @proposal = Proposal.find(params[:proposal_id])
    end
end
