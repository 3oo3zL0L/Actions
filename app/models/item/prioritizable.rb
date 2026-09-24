module Item::Prioritizable
  extend ActiveSupport::Concern

  included do
    scope :prioritized, -> { where.not(prioritized_at: nil).order(:prioritized_at) }
    scope :unprioritized, -> { where(prioritized_at: nil) }
  end

  def prioritize(why: nil)
    update! prioritized_at: Time.current, why: why.presence || self.why
  end

  def deprioritize
    update! prioritized_at: nil, why: nil
  end

  def prioritized?
    prioritized_at.present?
  end
end
