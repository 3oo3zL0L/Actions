# Een bron waar werk vandaan komt: Microsoft 365, Atlassian of Claude.
# Elke bron haalt op wat er speelt en zet dat neer als Entry; de werkplek leest alleen die tabel.
class Source < ApplicationRecord
  include Requestable, Syncable

  PROVIDERS = %w[ microsoft atlassian claude ].freeze

  has_many :entries, dependent: :delete_all

  encrypts :access_token, :refresh_token

  class << self
    def for(provider)
      "Source::#{provider.to_s.classify}".constantize if provider.to_s.in?(PROVIDERS)
    end

    def provider
      name.demodulize.underscore
    end

    def connected
      find_by(type: name)
    end

    def configured?
      true
    end

    def setting(key)
      ENV["#{provider.upcase}_#{key.to_s.upcase}"].presence || Rails.application.credentials.dig(provider.to_sym, key)
    end
  end

  delegate :provider, to: :class

  def title
    provider.titleize
  end
end
