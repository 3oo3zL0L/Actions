# Van alles wat binnenkomt kun je in één tik een actie maken, met de link terug naar de bron.
module Entry::Actionable
  extend ActiveSupport::Concern

  ORIGINS = { "event" => "agenda", "mail" => "mail", "chat" => "teams", "deck" => "powerpoint",
    "page" => "confluence", "epic" => "jira", "project" => "claude" }.freeze

  # Zonder programma deelt Item::Classifiable hem zelf in.
  def create_action
    transaction do
      update! item: Item.create!(text: title, program: program, source: ORIGINS.fetch(kind),
        mail_url: (url if url&.match?(%r{\Ahttps://\S+\z})),
        note: [ person, summary ].compact_blank.join(": ").truncate(280).presence)
      item
    end
  end

  def actioned?
    item_id.present?
  end
end
