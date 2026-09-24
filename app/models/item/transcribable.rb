# Heen en terug naar het markdownformaat van /areas/todos.md:
#
#   ## Contracten
#   - [ ] JProfiler-licentie verlengen | Kim | 1 okt
module Item::Transcribable
  extend ActiveSupport::Concern

  LINE = /\A\s*[-*]\s*\[\s\]\s*(?<text>[^|]+?)\s*(?:\|\s*(?<who>[^|]*?)\s*)?(?:\|\s*(?<due>[^|]*?)\s*)?\z/
  HEADING = /\A\#{1,6}\s+(?<name>.+?)\s*\z/
  MONTHS = %w[ jan feb mrt apr mei jun jul aug sep okt nov dec ].freeze

  class_methods do
    def import_markdown(markdown)
      program = Program.fallback

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

  def to_markdown
    "- [ ] #{text} | #{who} | #{due_on ? I18n.l(due_on, format: :short) : "-"}"
  end
end
