# JSON over HTTPS met Net::HTTP. Geen SDK's: drie API's, een handvol GET's.
module Source::Requestable
  extend ActiveSupport::Concern

  class Error < StandardError; end
  class Unauthorized < Error; end

  class_methods do
    def request(method, url, query: {}, json: nil, form: nil, headers: {})
      uri = URI(url)
      uri.query = [ uri.query, query.to_query ].compact_blank.join("&") if query.present?

      request = Net::HTTP.const_get(method.to_s.capitalize).new(uri, { "Accept" => "application/json" }.merge(headers))
      if json
        request.content_type = "application/json"
        request.body = json.to_json
      elsif form
        request.set_form_data(form)
      end

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 20) { |http| http.request(request) }

      case response
      when Net::HTTPSuccess then response.body.present? ? JSON.parse(response.body) : {}
      when Net::HTTPUnauthorized, Net::HTTPForbidden then raise Unauthorized, "#{response.code} op #{uri.host}#{uri.path}"
      else raise Error, "#{response.code} op #{uri.host}#{uri.path}: #{response.body.to_s.truncate(200)}"
      end
    rescue SocketError, Timeout::Error, Errno::ECONNREFUSED, OpenSSL::SSL::SSLError => error
      raise Error, "#{uri.host} onbereikbaar: #{error.message}"
    end
  end

  delegate :request, to: :class
end
