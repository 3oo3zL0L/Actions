class CreateItems < ActiveRecord::Migration[8.1]
  def change
    create_table :items do |t|
      t.references :program, null: false, foreign_key: true
      t.string :text, null: false
      t.string :who, null: false, default: "eigen actie"
      t.date :due_on
      t.text :note
      t.text :why
      t.string :mail_url
      t.string :source, null: false, default: "klad"
      t.datetime :prioritized_at
      t.datetime :completed_at
      t.datetime :dropped_at
      t.boolean :classified, null: false, default: true
      t.text :pending_instruction

      t.timestamps
    end
    add_index :items, :completed_at
    add_index :items, :prioritized_at
  end
end
