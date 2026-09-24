class CapturesController < ApplicationController
  allow_token_access

  def create
    capture = Capture.new(capture_params)

    if capture.save
      items = capture.spoken? ? [] : capture.process

      respond_to do |format|
        format.html { redirect_to root_path, notice: notice_for(capture, items) }
        format.json { render json: { id: capture.id, items: items.map(&:id) }, status: :created }
      end
    else
      respond_to do |format|
        format.html { redirect_to root_path, alert: "Typ eerst een actie." }
        format.json { render json: { errors: capture.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  private
    def capture_params
      params.expect(capture: %i[ body spoken ])
    end

    def notice_for(capture, items)
      if capture.spoken?
        "Ingesproken, wordt opgesplitst en ingedeeld."
      else
        "#{items.many? ? "#{items.size} acties" : "Staat"} op de lijst."
      end
    end
end
