class CreatePrograms < ActiveRecord::Migration[8.1]
  def change
    create_table :programs do |t|
      t.string :name, null: false
      t.text :note
      t.integer :position, null: false, default: 0

      t.timestamps
    end
    add_index :programs, :name, unique: true
  end
end
