# Een sync zet alles wat de bron nu teruggeeft neer en ruimt op wat er niet meer bij zat.
# Bijvoorbeeld: gelezen mail valt weg, een afgesloten epic ook.
module Source::Syncable
  extend ActiveSupport::Concern

  included do
    after_create_commit :sync_later
  end

  class_methods do
    def sync_all_later
      find_each(&:sync_later)
    end
  end

  def sync_later
    Source::SyncJob.perform_later(self)
  end

  def sync
    started_at = Time.current
    matcher = Program.matcher

    transaction do
      fetch.each do |attributes|
        entries.find_or_initialize_by(attributes.slice(:kind, :external_id)).tap do |entry|
          entry.assign_attributes attributes.merge(seen_at: started_at)
          entry.program = matcher.call(entry.searchable_text)
          entry.save!
        end
      end

      entries.where(seen_at: ...started_at).delete_all
      update! synced_at: started_at, sync_error: nil
    end
  rescue Source::Requestable::Unauthorized => error
    update_columns sync_error: "Opnieuw koppelen nodig (#{error.message})"
  rescue Source::Requestable::Error => error
    update_columns sync_error: error.message.truncate(250)
  end

  def synced?
    synced_at.present?
  end

  private
    # Elke bron geeft een lijst hashes terug met ten minste kind, external_id en title.
    def fetch
      raise NotImplementedError
    end
end
