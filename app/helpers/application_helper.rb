module ApplicationHelper
  ICONS = {
    sparkle: '<path d="M12 3.5c.7 4.4 3.1 6.8 7.5 7.5-4.4.7-6.8 3.1-7.5 7.5-.7-4.4-3.1-6.8-7.5-7.5 4.4-.7 6.8-3.1 7.5-7.5Z"/><path d="M19 3v3M17.5 4.5h3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    enter: '<path d="M20 5v7a3 3 0 0 1-3 3H5"/><path d="m9 11-4 4 4 4"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'
  }.freeze

  # Wat je Claude kunt vragen. De briefing van de actie komt er altijd onder.
  CLAUDE_INTENTS = {
    item: {
      "Volgende stap" => "Help me deze actie verder te brengen. Wat is de eerstvolgende concrete stap? Doe wat je nu al voor me kunt doen en zeg wat je van mij nodig hebt.",
      "Bericht opstellen" => "Schrijf een kort, direct bericht (mail of Teams) dat deze actie verder brengt. Nederlands, zakelijk, geen opvulling. Geef alleen het bericht.",
      "Uitzoeken" => "Zoek uit wat ik moet weten om deze actie op te pakken. Kort, feitelijk, met bronnen.",
      "Opknippen" => "Knip deze actie op in kleine stappen van hooguit een halfuur, in de volgorde waarin ik ze moet doen."
    },
    proposal: {
      "Antwoord opstellen" => "Stel een kort, direct antwoord op deze mail op. Nederlands, zakelijk, geen opvulling. Geef alleen het antwoord.",
      "Wat wordt er gevraagd" => "Wat wordt hier precies van mij verwacht, en voor wanneer? Twee zinnen.",
      "Volgende stap" => "Wat is de eerstvolgende concrete stap om dit af te handelen? Doe wat je nu al voor me kunt doen."
    }
  }.freeze

  def icon(name, **options)
    tag.svg ICONS.fetch(name).html_safe, viewBox: "0 0 24 24", "aria-hidden": true, class: [ "icon", options[:class] ]
  end

  def greeting
    case Time.current.hour
    when 5...12 then "Goedemorgen"
    when 12...18 then "Goedemiddag"
    else "Goedenavond"
    end
  end

  def due_label(item)
    days = (item.due_on - Date.current).to_i

    case days
    when ...-13 then "verlopen · #{l item.due_on, format: :short}"
    when ...-1 then "verlopen · #{-days} dagen"
    when -1 then "verlopen · gisteren"
    when 0 then "vandaag"
    when 1 then "morgen"
    when 2..6 then l(item.due_on, format: "%A").downcase
    else l(item.due_on, format: :short)
    end
  end

  def due_soon?(item)
    item.active? && (0..1).cover?((item.due_on - Date.current).to_i)
  end

  def initials(name)
    name.to_s.split.map(&:first).first(2).join.upcase
  end

  def ask_claude_button(record, compact: false)
    kind = record.model_name.element
    tag.button type: "button", class: [ "act act--claude", { "act--compact": compact } ],
      title: "Vraag Claude", aria: { label: "Vraag Claude: #{record.text}", haspopup: "dialog" },
      data: { action: "ask-claude#open", ask_claude_kind_param: kind, ask_claude_title_param: record.text, ask_claude_brief_param: record.brief } do
      safe_join [ icon(:sparkle), tag.span("Vraag Claude", class: "act__label") ]
    end
  end
end
