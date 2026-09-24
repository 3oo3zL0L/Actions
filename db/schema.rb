# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_09_24_083442) do
  create_table "captures", force: :cascade do |t|
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.datetime "processed_at"
    t.boolean "spoken", default: false, null: false
    t.datetime "updated_at", null: false
  end

  create_table "items", force: :cascade do |t|
    t.boolean "classified", default: true, null: false
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.datetime "dropped_at"
    t.date "due_on"
    t.string "mail_url"
    t.text "note"
    t.text "pending_instruction"
    t.datetime "prioritized_at"
    t.integer "program_id", null: false
    t.string "source", default: "klad", null: false
    t.string "text", null: false
    t.datetime "updated_at", null: false
    t.string "who", default: "eigen actie", null: false
    t.text "why"
    t.index ["completed_at"], name: "index_items_on_completed_at"
    t.index ["prioritized_at"], name: "index_items_on_prioritized_at"
    t.index ["program_id"], name: "index_items_on_program_id"
  end

  create_table "programs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.text "note"
    t.integer "position", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_programs_on_name", unique: true
  end

  create_table "proposals", force: :cascade do |t|
    t.datetime "accepted_at"
    t.datetime "created_at", null: false
    t.datetime "dismissed_at"
    t.integer "item_id"
    t.string "mail_url"
    t.string "program_name"
    t.string "sender"
    t.string "subject"
    t.string "text", null: false
    t.datetime "updated_at", null: false
    t.index ["item_id"], name: "index_proposals_on_item_id"
  end

  create_table "sessions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "ip_address"
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.integer "user_id", null: false
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "api_token"
    t.datetime "created_at", null: false
    t.string "email_address", null: false
    t.string "password_digest", null: false
    t.datetime "updated_at", null: false
    t.index ["api_token"], name: "index_users_on_api_token", unique: true
    t.index ["email_address"], name: "index_users_on_email_address", unique: true
  end

  add_foreign_key "items", "programs"
  add_foreign_key "proposals", "items", on_delete: :nullify
  add_foreign_key "sessions", "users"
end
