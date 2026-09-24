# Wat Thomas in het klad typt of inspreekt. Getypt: één actie per regel, meteen op de lijst.
# Ingesproken: één lange zin zonder leestekens, die op de achtergrond in losse acties wordt gesplitst.
class Capture < ApplicationRecord
  validate :must_hold_an_action

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

  # Zoals Item de tekst bewaart: zonder dubbele spaties en zonder punt aan het eind.
  def lines
    body.to_s.lines.map { |line| line.squish.delete_suffix(".") }.compact_blank
  end

  private
    def entries
      split_by_assistant || lines.map { |line| { text: line } }
    end

    def split_by_assistant
      if spoken? && (actions = Assistant.split(body)).present?
        actions.select { |action| action["text"].present? }.map do |action|
          { text: action["text"], who: action["who"], due_on: action["due_on"], program: Program.named(action["program"]), classified: true }
        end.presence
      end
    end

    def must_hold_an_action
      errors.add :body, :blank if lines.empty?
    end
end
