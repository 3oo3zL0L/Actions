class Program < ApplicationRecord
  FALLBACK = "Overig"

  has_many :items, dependent: :restrict_with_error

  validates :name, presence: true, uniqueness: true

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
  end

  def to_param
    "#{id}-#{name.parameterize}"
  end
end
