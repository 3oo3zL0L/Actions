# De ochtendrun in Cowork zet hier voorstellen uit de mail neer.
class ProposalsController < ApplicationController
  allow_token_access

  def create
    proposal = Proposal.create!(proposal_params)
    render json: { id: proposal.id }, status: :created
  end

  private
    def proposal_params
      params.expect(proposal: %i[ text sender subject program_name mail_url ])
    end
end
