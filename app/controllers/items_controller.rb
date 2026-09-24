class ItemsController < ApplicationController
  allow_token_access only: :index
  before_action :set_item, except: :index

  def index
    @items = Item.active.includes(:program).ordered

    respond_to do |format|
      format.html do
        @today = Item.active.prioritized.includes(:program)
        @backlog = @items.unprioritized.group_by(&:program).sort_by { |program, _| [ program.position, program.name ] }
        @closed_today = Item.closed_today.includes(:program).order(:updated_at)
        @late = @items.select(&:late?)
        @proposals = Proposal.pending
        @last_decision = Proposal.last_decision
      end
      format.md
      format.json { render json: @items.as_json(except: %i[ pending_instruction ], methods: :late?, include: { program: { only: :name } }) }
    end
  end

  def show
  end

  def edit
  end

  def update
    if @item.update(item_params)
      redirect_to root_path
    else
      render :edit, status: :unprocessable_entity
    end
  end

  private
    def set_item
      @item = Item.find(params[:id])
    end

    def item_params
      params.expect(item: %i[ text who due_on note program_id mail_url ])
    end
end
