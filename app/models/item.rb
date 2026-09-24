class Item < ApplicationRecord
  include Classifiable, Closeable, Prioritizable, Rewritable, Transcribable

  OWN = "eigen actie"
  MAX_TEXT = 300

  belongs_to :program
  has_one :proposal, dependent: :nullify

  normalizes :text, with: ->(text) { text.squish.delete_suffix(".") }
  normalizes :who, with: ->(who) { who.to_s.squish.presence || OWN }, apply_to_nil: true
  normalizes :mail_url, with: ->(url) { url.strip.presence }

  validates :text, presence: true, length: { maximum: MAX_TEXT }

  before_validation :move_overflow_to_note
  validates :mail_url, format: { with: %r{\Ahttps://\S+\z} }, allow_nil: true

  after_commit -> { broadcast_refresh_later_to :items }

  scope :ordered, -> { order(Arel.sql("due_on IS NULL"), :due_on, :created_at) }

  def late?
    active? && due_on&.past?
  end

  def own?
    who == OWN
  end

  private
    # Een te lange actie (een lang voorstel uit de mail, een doorgeratelde dictatie) wordt ingekort;
    # de volledige tekst gaat naar de toelichting, zodat er niets verloren gaat.
    def move_overflow_to_note
      if text.to_s.length > MAX_TEXT
        self.note = [ text, note ].compact_blank.join("\n")
        self.text = text.truncate(MAX_TEXT, separator: " ")
      end
    end
end
