class Proposals::AcceptancesController < ApplicationController
  include ProposalScoped

  def create
    @proposal.accept
    redirect_to items_path
  end

  def destroy
    @proposal.undecide
    redirect_to items_path
  end
end
