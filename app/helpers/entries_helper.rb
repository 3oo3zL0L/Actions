module EntriesHelper
  KIND_LABELS = { "event" => "Agenda", "mail" => "Mail", "chat" => "Teams", "deck" => "PowerPoint",
    "page" => "Confluence", "epic" => "Epics", "project" => "Claude" }.freeze

  def kind_label(kind)
    KIND_LABELS.fetch(kind.to_s)
  end

  def entry_when(entry)
    return unless entry.starts_at

    if entry.kind == "event"
      "#{l entry.starts_at, format: "%H:%M"}–#{l entry.ends_at, format: "%H:%M"}" if entry.ends_at
    elsif entry.starts_at.today?
      l entry.starts_at, format: "%H:%M"
    else
      l entry.starts_at.to_date, format: :short
    end
  end

  def source_status(source)
    if source.sync_error
      tag.span source.sync_error, class: "chip chip--late"
    elsif source.synced?
      tag.span "bijgewerkt #{l source.synced_at, format: "%H:%M"}", class: "chip"
    else
      tag.span "ophalen…", class: "chip chip--busy"
    end
  end
end
