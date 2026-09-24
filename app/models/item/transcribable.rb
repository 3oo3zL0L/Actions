# Heen en terug naar het markdownformaat van /areas/todos.md:
#
#   ## Contracten
#   - [ ] JProfiler-licentie verlengen | Kim | 1 okt
module Item::Transcribable
  extend ActiveSupport::Concern

  LINE = /\A\s*[-*]\s*\[\s?\]\s*(?<text>[^|]+?)\s*(?:\|\s*(?<who>[^|]*?)\s*)?(?:\|\s*(?<due>[^|]*?)\s*)?\z/
  HEADING = /\A\#{2,6}\s+(?<name>.+?)\s*\z/
  MONTHS = %w[ jan feb mrt apr mei jun jul aug sep okt nov dec ].freeze

  class_methods do
    # Kopjes vanaf ## worden programma's; de titel met één # hoort bij het bestand, niet bij de lijst.
    # Alles of niets: een halve import die je opnieuw doet, geeft dubbele acties.
    def import_markdown(markdown)
      program = Program.fallback

      transaction do
        markdown.to_s.each_line.filter_map do |line|
          if heading = HEADING.match(line)
            program = Program.find_or_create_by!(name: heading[:name]) { |new_program| new_program.position = Program.maximum(:position).to_i + 1 }
            nil
          elsif entry = LINE.match(line)
            due_on = parse_due(entry[:due])
            loose_due = entry[:due] if due_on.nil? && entry[:due].present? && entry[:due] != "-"

            create! program: program, text: entry[:text], who: (entry[:who] unless entry[:who] == "-"),
              due_on: due_on, note: ("Deadline: #{loose_due}" if loose_due), source: "import", classified: true
          end
        end
      end
    end

    def parse_due(value)
      return if value.blank? || value == "-"

      if match = value.match(/\A(?<day>\d{1,2})\s+(?<month>[a-z]{3})\w*\.?(?:\s+(?<year>\d{4}))?\z/i)
        month = MONTHS.index(match[:month].downcase.sub("maa", "mrt").sub("mar", "mrt").sub("may", "mei").sub("oct", "okt"))
        Date.new((match[:year] || Date.current.year).to_i, month + 1, match[:day].to_i) if month
      else
        Date.iso8601(value)
      end
    rescue Date::Error
      nil
    end
  end

  # Het jaar staat erbij zodra het niet dit jaar is, anders wordt 15 jan 2027 bij terugzetten 15 jan van dit jaar.
  # Een | in de tekst zou de kolommen breken, dus die wordt een /.
  def to_markdown
    "- [ ] #{text.tr("|", "/")} | #{who.tr("|", "/")} | #{markdown_due}"
  end

  private
    def markdown_due
      if due_on.nil?
        "-"
      elsif due_on.year == Date.current.year
        I18n.l(due_on, format: :short)
      else
        I18n.l(due_on, format: :short_with_year)
      end
    end
end
