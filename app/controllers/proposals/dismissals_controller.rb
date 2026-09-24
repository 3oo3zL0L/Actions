class Proposals::DismissalsController < ApplicationController
  include ProposalScoped

  def create
    @proposal.dismiss
    redirect_to root_path
  end

  def destroy
    @proposal.undecide
    redirect_to root_path
  end
end
