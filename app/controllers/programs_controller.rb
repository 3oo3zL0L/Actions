# Per programma alles bij elkaar: epics, pagina's, decks, het Claude-project, mail en de open acties.
class ProgramsController < ApplicationController
  before_action :set_program, except: :index

  def index
    @programs = Program.ordered
    @counts = Entry.group(:program_id, :kind).count
    @open = Item.active.group(:program_id).count
  end

  def show
    @entries = @program.entries.recent.group_by(&:kind)
    @items = @program.items.active.ordered
  end

  def edit
  end

  def update
    if @program.update(program_params)
      Source.sync_all_later if @program.keywords_previously_changed?
      redirect_to @program
    else
      render :edit, status: :unprocessable_entity
    end
  end

  private
    def set_program
      @program = Program.find(params[:id])
    end

    def program_params
      params.expect(program: %i[ keywords claude_url note ])
    end
end
