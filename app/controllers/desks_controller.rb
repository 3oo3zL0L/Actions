# De werkplek: wat er vandaag speelt, uit alle bronnen, met de acties voor vandaag ernaast.
class DesksController < ApplicationController
  def show
    @events = Entry.events.upcoming.where(starts_at: ..Time.current.end_of_day).chronological.includes(:program)
    @later_events = Entry.events.where(starts_at: Time.current.tomorrow.all_day).chronological
    @mails = Entry.mails.needing_attention.recent.limit(15).includes(:program)
    @chats = Entry.chats.recent.limit(10).includes(:program)
    @decks = Entry.decks.recent.limit(6)
    @pages = Entry.pages.recent.limit(6)

    @today = Item.active.prioritized.includes(:program)
    @late = Item.active.where(due_on: ...Date.current).includes(:program).ordered
    @proposals = Proposal.pending
    @sources = Source.all
  end
end
