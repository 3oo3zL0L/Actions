# Een voorstel uit de mail: hier wordt iets van Thomas verwacht, denkt de ochtendrun.
class Proposal < ApplicationRecord
  include Decidable

  belongs_to :item, optional: true

  validates :text, presence: true
  validates :mail_url, format: { with: %r{\Ahttps://\S+\z} }, allow_blank: true

  after_commit -> { broadcast_refresh_later_to :items }

  def brief
    [
      "Verzoek: #{text}",
      ("Van: #{sender}" if sender.present?),
      ("Onderwerp: #{subject}" if subject.present?),
      ("Programma: #{program_name}" if program_name.present?),
      ("Mail: #{mail_url}" if mail_url.present?)
    ].compact.join("\n")
  end

  def source_line
    [ sender, subject, program_name ].compact_blank.join(" · ")
  end
end
