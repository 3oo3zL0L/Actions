# Alles wat Claude moet weten om een actie op te pakken, als platte tekst voor een nieuwe chat.
module Item::Briefable
  extend ActiveSupport::Concern

  def brief
    [
      "Actie: #{text}",
      "Programma: #{program.name}",
      ("Ligt bij: #{who}" unless own?),
      ("Deadline: #{I18n.l(due_on, format: :long)}#{" (verlopen)" if late?}" if due_on),
      ("Waarom vandaag: #{why}" if why? && prioritized?),
      ("Toelichting: #{note}" if note?),
      ("Mail: #{mail_url}" if mail_url)
    ].compact.join("\n")
  end
end
