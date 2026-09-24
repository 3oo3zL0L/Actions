class Proposals::DismissalsController < ApplicationController
  include ProposalScoped

  def create
    @proposal.dismiss
    redirect_to items_path
  end

  def destroy
    @proposal.undecide
    redirect_to items_path
  end
end
