# Wat Thomas in het klad typt of inspreekt. Getypt: één actie per regel, meteen op de lijst.
# Ingesproken: één lange zin zonder leestekens, die op de achtergrond in losse acties wordt gesplitst.
class Capture < ApplicationRecord
  validates :body, presence: true

  after_create_commit :process_later, if: :spoken?

  def process_later
    Capture::ProcessJob.perform_later(self)
  end

  def process
    transaction do
      items = entries.map { |entry| Item.create!(entry.merge(source: spoken? ? "spraak" : "klad")) }
      update! processed_at: Time.current
      items
    end
  end

  def lines
    body.lines.map(&:squish).compact_blank
  end

  private
    def entries
      split_by_assistant || lines.map { |line| { text: line } }
    end

    def split_by_assistant
      if spoken? && (actions = Assistant.split(body)).present?
        actions.map do |action|
          { text: action["text"], who: action["who"], due_on: action["due_on"], program: Program.named(action["program"]), classified: true }
        end
      end
    end
end
