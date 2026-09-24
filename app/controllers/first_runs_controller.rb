# Eén account per installatie, zoals bij ONCE: de eerste bezoeker maakt het aan.
class FirstRunsController < ApplicationController
  allow_unauthenticated_access
  before_action :prevent_repeats

  def new
    @user = User.new
  end

  def create
    @user = User.new(user_params)

    if @user.save
      start_new_session_for @user
      redirect_to root_url
    else
      render :new, status: :unprocessable_entity
    end
  end

  private
    def prevent_repeats
      redirect_to root_url if User.any?
    end

    def user_params
      params.expect(user: %i[ email_address password ])
    end
end
