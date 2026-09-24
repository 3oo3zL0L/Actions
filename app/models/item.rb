class Item < ApplicationRecord
  include Briefable, Classifiable, Closeable, Prioritizable, Rewritable, Transcribable

  OWN = "eigen actie"

  belongs_to :program
  has_one :proposal, dependent: :nullify

  normalizes :text, with: ->(text) { text.squish.delete_suffix(".") }
  normalizes :who, with: ->(who) { who.to_s.squish.presence || OWN }, apply_to_nil: true
  normalizes :mail_url, with: ->(url) { url.strip.presence }

  validates :text, presence: true, length: { maximum: 300 }
  validates :mail_url, format: { with: %r{\Ahttps://\S+\z} }, allow_nil: true

  after_commit -> { broadcast_refresh_later_to :items }

  scope :ordered, -> { order(Arel.sql("due_on IS NULL"), :due_on, :created_at) }

  def late?
    active? && due_on&.past?
  end

  def own?
    who == OWN
  end
end
