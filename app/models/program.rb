class Program < ApplicationRecord
  FALLBACK = "Overig"

  has_many :items, dependent: :restrict_with_error
  has_many :entries, dependent: :nullify

  normalizes :keywords, with: ->(keywords) { keywords.split(",").map(&:squish).compact_blank.uniq.join(", ").presence }
  normalizes :claude_url, with: ->(url) { url.strip.presence }

  validates :name, presence: true, uniqueness: true
  validates :claude_url, format: { with: %r{\Ahttps://\S+\z} }, allow_nil: true

  scope :ordered, -> { order(:position, :name) }

  class << self
    def named(name)
      find_by(name: name.to_s.strip).presence || fallback
    end

    def fallback
      find_or_create_by!(name: FALLBACK) { |program| program.position = 99 }
    end

    def names
      ordered.pluck(:name)
    end

    # Wat uit een bron komt hoort bij het eerste programma waarvan de naam of een trefwoord erin staat.
    # Een trefwoord als "OIDC" of een Jira-sleutel als "PLAT" matcht als heel woord, hoofdletters maken niet uit.
    def matcher
      patterns = ordered.where.not(name: FALLBACK).map { |program| [ program, program.pattern ] }
      ->(text) { patterns.find { |_, pattern| pattern.match?(text) }&.first }
    end
  end

  def terms
    [ name, *keywords.to_s.split(",") ].map(&:squish).compact_blank
  end

  def pattern
    /(?<![[:alnum:]])(?:#{terms.map { |term| Regexp.escape(term) }.join("|")})(?![[:alnum:]])/i
  end

  def to_param
    "#{id}-#{name.parameterize}"
  end
end
