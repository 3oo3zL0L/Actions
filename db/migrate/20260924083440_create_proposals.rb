class CreateProposals < ActiveRecord::Migration[8.1]
  def change
    create_table :proposals do |t|
      t.string :text, null: false
      t.string :sender
      t.string :subject
      t.string :program_name
      t.string :mail_url
      t.references :item, foreign_key: { on_delete: :nullify }
      t.datetime :accepted_at
      t.datetime :dismissed_at

      t.timestamps
    end
  end
end
