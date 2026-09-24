# Claude als secretaris: deelt acties in, splitst dictaat op en herschrijft op instructie.
# Zonder API-sleutel doet de app gewoon alles zelf, alleen zonder slimmigheid.
module Assistant
  MODEL = ENV.fetch("ASSISTANT_MODEL", "claude-opus-5").to_sym
  RETRYABLE = [ Anthropic::Errors::RateLimitError, Anthropic::Errors::InternalServerError, Anthropic::Errors::APIConnectionError ].freeze

  ABOUT_THOMAS = <<~TEXT.freeze
    Je onderhoudt de actielijst van Thomas, Software Development Manager bij Planon en leider van de PAF-programma's.
    Contracten is voor leverancierscontracten en licenties. Overig alleen als niets anders past.
    Toon: direct, zakelijk, geen opvulling, geen em-dashes.
  TEXT

  extend self

  def enabled?
    api_key.present?
  end

  def classify(text)
    ask <<~PROMPT, schema: object(program: program_schema, who: string, due_on: date)
      #{ABOUT_THOMAS}
      Deel deze losse actie in. Kies precies één programma.
      who: een persoonsnaam uit de tekst als de actie bij iemand anders ligt, "prive" bij een privé-actie, anders "eigen actie".
      due_on: de deadline als ISO-datum als die in de tekst staat, anders null. Vandaag is #{today}.

      Actie: #{text}
    PROMPT
  end

  def split(dictation)
    action = object(text: string, program: program_schema, who: string, due_on: date)

    ask(<<~PROMPT, schema: object(actions: { type: "array", items: action }))&.fetch("actions")&.first(12)
      #{ABOUT_THOMAS}
      Hieronder staat ingesproken tekst van Thomas: dictatie via zijn telefoon, mogelijk zonder leestekens en met spraakfouten.
      Haal er de losse acties uit. Per actie:
      - text: korte gebiedende regel in zijn eigen woorden, met hoofdletter, zonder punt. Verbeter alleen duidelijke dicteerfouten. Verzin niets.
      - program: precies één programma.
      - who: een persoonsnaam als de actie bij iemand anders ligt, "prive" bij een privé-actie, anders "eigen actie".
      - due_on: deadline als ISO-datum als hij die noemt, anders null. Vandaag is #{today}.

      Ingesproken tekst: #{dictation}
    PROMPT
  end

  def rewrite(item, instruction)
    current = { text: item.text, who: item.who, due_on: item.due_on&.iso8601, note: item.note.to_s, program: item.program.name }

    ask <<~PROMPT, schema: object(text: string, who: string, due_on: date, note: string, program: program_schema)
      #{ABOUT_THOMAS}
      Hieronder staat een bestaande actie en een instructie van Thomas in gewone taal. Pas de actie aan.
      Raak alleen aan wat de instructie raakt, laat de rest exact zoals het was.
      - text: korte gebiedende regel, geen datum en geen naam erin, geen punt aan het eind.
      - who: een persoonsnaam als de actie bij iemand anders ligt, anders "eigen actie", of "prive".
      - due_on: ISO-datum of null. Vandaag is #{today}.
      - note: hooguit een korte zin context die niet in de actie past, anders leeg.

      Huidige actie: #{current.to_json}
      Instructie van Thomas: #{instruction}
    PROMPT
  end

  private
    def ask(prompt, schema:)
      return unless enabled?

      message = client.messages.create \
        model: MODEL,
        max_tokens: 4096,
        output_config: { effort: :low, format: { type: :json_schema, schema: schema } },
        messages: [ { role: "user", content: prompt } ]

      if message.stop_reason == :end_turn && (answer = message.content.find { |block| block.type == :text })
        JSON.parse(answer.text)
      else
        Rails.logger.warn "Assistant stopped with #{message.stop_reason}"
        nil
      end
    rescue *RETRYABLE
      raise
    rescue Anthropic::Errors::APIStatusError, JSON::ParserError => error
      Rails.logger.error "Assistant failed: #{error.class}: #{error.message}"
      nil
    end

    def client
      @client ||= Anthropic::Client.new(api_key: api_key)
    end

    def api_key
      ENV["ANTHROPIC_API_KEY"].presence || Rails.application.credentials.dig(:anthropic, :api_key)
    end

    def today
      Date.current.iso8601
    end

    def program_schema
      { type: "string", enum: Program.names.presence || [ Program::FALLBACK ] }
    end

    def string
      { type: "string" }
    end

    def date
      { anyOf: [ { type: "string", format: "date" }, { type: "null" } ] }
    end

    def object(**properties)
      { type: "object", properties: properties, required: properties.keys.map(&:to_s), additionalProperties: false }
    end
end
