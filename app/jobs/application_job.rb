class ApplicationJob < ActiveJob::Base
  retry_on *Assistant::RETRYABLE, wait: :polynomially_longer, attempts: 5
  discard_on ActiveJob::DeserializationError
end
