module Item::Closeable
  extend ActiveSupport::Concern

  included do
    scope :active, -> { where(completed_at: nil, dropped_at: nil) }
    scope :closed, -> { where.not(completed_at: nil).or(where.not(dropped_at: nil)) }
    scope :closed_today, -> { closed.where(completed_at: Time.current.all_day).or(where(dropped_at: Time.current.all_day)) }
    scope :long_closed, -> { where(completed_at: ...2.weeks.ago).or(where(dropped_at: ...2.weeks.ago)) }
  end

  class_methods do
    # Klaar is weg: afgesloten acties blijven een dag zichtbaar en worden na twee weken opgeruimd.
    def sweep
      long_closed.destroy_all
    end
  end

  def complete
    update! completed_at: Time.current, dropped_at: nil
  end

  def drop
    update! dropped_at: Time.current, completed_at: nil
  end

  def reopen
    update! completed_at: nil, dropped_at: nil
  end

  def completed?
    completed_at.present?
  end

  def dropped?
    dropped_at.present?
  end

  def closed?
    completed? || dropped?
  end

  def active?
    !closed?
  end
end
