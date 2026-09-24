# Iets uit een bron dat om aandacht vraagt: een mail, een afspraak, een chat, een deck, een pagina, een epic, een project.
class Entry < ApplicationRecord
  include Actionable

  KINDS = %w[ event mail chat deck page epic project ].freeze

  belongs_to :source
  belongs_to :program, optional: true
  belongs_to :item, optional: true

  validates :kind, inclusion: { in: KINDS }
  validates :title, :external_id, presence: true

  normalizes :title, with: ->(title) { title.to_s.squish.truncate(250) }
  normalizes :url, with: ->(url) { url.to_s.strip[%r{\Ahttps://\S+\z}] }

  after_commit -> { broadcast_refresh_later_to :desk }

  scope :recent, -> { order(starts_at: :desc) }
  scope :chronological, -> { order(:starts_at) }
  KINDS.each { |kind| scope kind.pluralize, -> { where(kind: kind) } }

  scope :today, -> { where(starts_at: Time.current.all_day) }
  scope :upcoming, -> { where(ends_at: Time.current..) }
  scope :unassigned, -> { where(program_id: nil) }
  scope :needing_attention, -> { where(unread: true).or(where(flagged: true)) }

  def searchable_text
    [ title, summary, person ].compact.join(" ")
  end

  def now?
    starts_at&.past? && ends_at&.future?
  end
end
