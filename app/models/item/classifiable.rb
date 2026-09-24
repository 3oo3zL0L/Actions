# Een actie zonder programma komt eerst onder Overig en wordt daarna op de achtergrond ingedeeld.
module Item::Classifiable
  extend ActiveSupport::Concern

  included do
    before_validation :assume_fallback_program, on: :create
    after_create_commit :classify_later, unless: :classified?
  end

  def classify_later
    Item::ClassifyJob.perform_later(self)
  end

  def classify
    return if classified?

    if verdict = Assistant.classify(text)
      update! program: Program.named(verdict["program"]), who: verdict["who"], due_on: verdict["due_on"] || due_on, classified: true
    else
      update! classified: true
    end
  end

  private
    def assume_fallback_program
      if program.nil?
        self.program = Program.fallback
        self.classified = !Assistant.enabled?
      end
    end
end
