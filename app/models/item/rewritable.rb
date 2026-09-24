# Wijzigen in gewone taal: "deadline naar 1 okt en Santhosh erbij".
module Item::Rewritable
  extend ActiveSupport::Concern

  def rewrite_later(instruction)
    update! pending_instruction: instruction.to_s.strip
    Item::RewriteJob.perform_later(self)
  end

  def rewrite
    return unless pending_instruction.present?

    if revision = Assistant.rewrite(self, pending_instruction)
      update! text: revision["text"], who: revision["who"], due_on: revision["due_on"], note: revision["note"].presence,
        program: Program.named(revision["program"]), pending_instruction: nil
    else
      update! note: [ note, pending_instruction ].compact_blank.join("\n"), pending_instruction: nil
    end
  end

  def rewriting?
    pending_instruction.present?
  end
end
