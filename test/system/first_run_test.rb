require "application_system_test_case"

class FirstRunTest < ApplicationSystemTestCase
  test "the first visitor creates the only account" do
    Session.delete_all
    User.delete_all

    visit root_path
    fill_in "E-mailadres", with: "thomas@example.com"
    fill_in "Wachtwoord", with: "geheim-en-lang"
    click_on "Beginnen"

    assert_selector "h1", text: "To do's"
  end
end
