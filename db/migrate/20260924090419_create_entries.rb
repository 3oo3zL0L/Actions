class CreateEntries < ActiveRecord::Migration[8.1]
  def change
    create_table :entries do |t|
      t.references :source, null: false, foreign_key: { on_delete: :cascade }
      t.references :program, foreign_key: { on_delete: :nullify }
      t.references :item, foreign_key: { on_delete: :nullify }
      t.string :kind, null: false
      t.string :external_id, null: false
      t.string :title, null: false
      t.text :summary
      t.string :url
      t.string :person
      t.string :status
      t.datetime :starts_at
      t.datetime :ends_at
      t.boolean :unread, default: false, null: false
      t.boolean :flagged, default: false, null: false
      t.datetime :seen_at, null: false
      t.timestamps
    end
    add_index :entries, %i[ source_id kind external_id ], unique: true
    add_index :entries, %i[ kind starts_at ]
  end
end
