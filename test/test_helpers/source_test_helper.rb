module SourceTestHelper
  # Laat een bron vaste JSON teruggeven per URL-fragment, zonder netwerk.
  def with_responses(source_class, responses)
    source_class.define_singleton_method(:request) do |method, url, **options|
      key = responses.keys.find { |fragment| url.include?(fragment) } or raise "Onverwacht verzoek: #{method} #{url}"
      answer = responses.fetch(key)
      answer.respond_to?(:call) ? answer.call(**options) : answer
    end
    yield
  ensure
    source_class.singleton_class.remove_method(:request)
  end
end

ActiveSupport.on_load(:active_support_test_case) { include SourceTestHelper }
