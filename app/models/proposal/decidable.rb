module Proposal::Decidable
  extend ActiveSupport::Concern

  included do
    scope :pending, -> { where(accepted_at: nil, dismissed_at: nil).order(:created_at) }
    scope :decided, -> { where.not(accepted_at: nil).or(where.not(dismissed_at: nil)) }
  end

  class_methods do
    # Het laatste besluit blijft even terug te draaien, zolang er met de actie nog niets gedaan is.
    def last_decision
      decided.where(updated_at: 10.minutes.ago..).order(updated_at: :desc).first.then { |decision| decision if decision&.undoable? }
    end
  end

  # Eén besluit per voorstel, ook bij twee tabs of een dubbele aanroep uit de ochtendrun.
  def accept
    with_lock do
      unless decided?
        create_item! text: text, program: Program.named(program_name), mail_url: mail_url.presence, source: "mail",
          note: ("Van #{sender}: #{subject}" if sender.present?), classified: true
        update! accepted_at: Time.current
      end
    end
  end

  def dismiss
    with_lock do
      update! dismissed_at: Time.current unless decided?
    end
  end

  # Terugdraaien haalt de actie weer weg, maar alleen zolang er nog niets mee gedaan is.
  def undecide
    with_lock do
      if undoable?
        item&.destroy!
        update! item: nil, accepted_at: nil, dismissed_at: nil
      end
    end
  end

  def undoable?
    item.nil? || item.updated_at <= accepted_at
  end

  def accepted?
    accepted_at.present?
  end

  def decided?
    accepted_at? || dismissed_at?
  end
end
