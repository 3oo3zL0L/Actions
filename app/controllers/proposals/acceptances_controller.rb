class Proposals::AcceptancesController < ApplicationController
  include ProposalScoped

  def create
    @proposal.accept
    redirect_to root_path
  end

  def destroy
    @proposal.undecide
    redirect_to root_path
  end
end
