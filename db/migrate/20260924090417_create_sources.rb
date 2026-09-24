class CreateSources < ActiveRecord::Migration[8.1]
  def change
    create_table :sources do |t|
      t.string :type, null: false
      t.string :account
      t.text :access_token
      t.text :refresh_token
      t.datetime :expires_at
      t.string :site_id
      t.string :site_url
      t.datetime :synced_at
      t.string :sync_error
      t.timestamps
    end
    add_index :sources, :type, unique: true
  end
end
