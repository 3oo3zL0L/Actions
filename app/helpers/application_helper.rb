module ApplicationHelper
  # Deadlines als afstand tot vandaag, zodat je niet hoeft te rekenen: "morgen", "vr", "3 dagen verlopen".
  def due_label(date, today: Date.current)
    days = (date - today).to_i

    case days
    when ...0 then "#{pluralize -days, "dag", plural: "dagen"} verlopen"
    when 0 then "vandaag"
    when 1 then "morgen"
    when 2..6 then l(date, format: "%a")
    else l(date, format: :short)
    end
  end

  def due_chip(item)
    days = (item.due_on - Date.current).to_i
    urgency = if item.late? then "chip--late" elsif item.active? && days <= 1 then "chip--soon" end

    tag.time due_label(item.due_on), datetime: item.due_on.iso8601, title: l(item.due_on, format: :long), class: [ "chip", urgency ]
  end

  def icon(name)
    paths = {
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
      star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
      mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
      plus: '<path d="M12 5v14M5 12h14"/>'
    }

    tag.svg paths.fetch(name).html_safe, viewBox: "0 0 24 24", class: "icon", aria: { hidden: true }
  end
end
