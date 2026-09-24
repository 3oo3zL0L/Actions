module AssistantTestHelper
  # Laat Assistant vaste antwoorden geven, zonder netwerk.
  def with_assistant(**answers)
    answers = { enabled?: true }.merge(answers)
    answers.each { |name, answer| Assistant.define_singleton_method(name) { |*| answer } }
    yield
  ensure
    answers.each_key { |name| Assistant.singleton_class.remove_method(name) }
  end
end

ActiveSupport.on_load(:active_support_test_case) { include AssistantTestHelper }
