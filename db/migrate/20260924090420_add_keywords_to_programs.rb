class AddKeywordsToPrograms < ActiveRecord::Migration[8.1]
  def change
    add_column :programs, :keywords, :string
    add_column :programs, :claude_url, :string
  end
end
