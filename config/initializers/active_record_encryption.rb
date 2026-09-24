# Tokens van Microsoft, Atlassian en Claude staan versleuteld in de database.
# Staan er geen sleutels in de credentials, dan leiden we ze af van secret_key_base.
Rails.application.config.to_prepare do
  unless ActiveRecord::Encryption.config.has_primary_key?
    generator = Rails.application.key_generator
    derive = ->(purpose) { generator.generate_key("active_record_encryption/#{purpose}", 32).unpack1("H*") }

    ActiveRecord::Encryption.configure primary_key: derive.("primary"), deterministic_key: derive.("deterministic"),
      key_derivation_salt: derive.("salt")
  end
end
