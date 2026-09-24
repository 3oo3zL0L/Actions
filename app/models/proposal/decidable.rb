module Proposal::Decidable
  extend ActiveSupport::Concern

  included do
    scope :pending, -> { where(accepted_at: nil, dismissed_at: nil).order(:created_at) }
    scope :decided, -> { where.not(accepted_at: nil).or(where.not(dismissed_at: nil)) }
  end

  class_methods do
    # Het laatste besluit blijft even terug te draaien.
    def last_decision
      decided.where(updated_at: 10.minutes.ago..).order(updated_at: :desc).first
    end
  end

  def accept
    transaction do
      create_item! text: text, program: Program.named(program_name), mail_url: mail_url.presence, source: "mail",
        note: ("Van #{sender}: #{subject}" if sender.present?), classified: true
      update! accepted_at: Time.current
    end
  end

  def dismiss
    update! dismissed_at: Time.current
  end

  def undecide
    transaction do
      item&.destroy!
      update! item: nil, accepted_at: nil, dismissed_at: nil
    end
  end

  def accepted?
    accepted_at.present?
  end
end
