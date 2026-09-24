class CreateCaptures < ActiveRecord::Migration[8.1]
  def change
    create_table :captures do |t|
      t.text :body, null: false
      t.boolean :spoken, null: false, default: false
      t.datetime :processed_at

      t.timestamps
    end
  end
end
