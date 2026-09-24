require "application_system_test_case"

class ListTest < ApplicationSystemTestCase
  setup { sign_in_as users(:thomas) }

  test "typing in the klad puts every line on the list" do
    fill_in "Nieuwe actie", with: "Rogier bellen"
    find_field("Nieuwe actie").send_keys :enter

    assert_text "Staat op de lijst."
    within(section_for("Overig")) { assert_text "Rogier bellen" }
    assert_field "Nieuwe actie", with: ""
    screenshot "list"
  end

  test "completing an item moves it to done today, and back" do
    click_on "Afgerond: JProfiler-licentie verlengen"
    within(".closed") { assert_text "JProfiler-licentie verlengen" }

    click_on "Terugzetten: JProfiler-licentie verlengen"
    within(section_for("Contracten")) { assert_text "JProfiler-licentie verlengen" }
    assert_no_selector ".closed", text: "JProfiler-licentie verlengen"
  end

  test "prioritising puts an item on today" do
    within(item_row("JProfiler-licentie verlengen")) { click_on "Prioritiseer" }
    within(".card--today") { assert_text "JProfiler-licentie verlengen" }

    within(item_row("JProfiler-licentie verlengen")) { click_on "Deprioritiseer" }
    within(section_for("Contracten")) { assert_text "JProfiler-licentie verlengen" }
  end

  test "editing an item by hand" do
    click_on "Bewerk: JProfiler-licentie verlengen"
    fill_in "Wie", with: "Santhosh"
    click_on "Bewaar"

    within(item_row("JProfiler-licentie verlengen")) { assert_text "Santhosh" }
    screenshot "edit"
  end

  test "dropping an item that is no longer relevant" do
    click_on "Bewerk: Snapshot invullen"
    click_on "Niet meer relevant"

    within(".closed") { assert_text(/n\.v\.t\./i) }
  end

  test "a late item says so" do
    within(item_row("Snapshot invullen")) { assert_text(/verlopen/i) }
  end

  test "accepting a proposal from the mail, and undoing it" do
    within(".proposal") { click_on "Op de lijst" }
    within(section_for("Contracten")) { assert_text "Akkoord geven op de upgrade naar Bitbucket Premium" }
    assert_text "staat nu op de lijst."

    click_on "Ongedaan maken"
    assert_selector ".proposal", text: "Akkoord geven op de upgrade naar Bitbucket Premium"
    assert_no_selector "section:not(.card) .item", text: "Bitbucket Premium"
  end

  test "dismissing a proposal" do
    within(".proposal") { click_on "Weg" }
    assert_text "is weg."
    assert_no_selector ".proposal"
  end

  test "importing from todos.md" do
    click_on "Importeren"
    fill_in "Markdown", with: "## Contracten\n- [ ] Offerte opvragen | Kim | 1 okt"
    click_on "Zet over"

    assert_text "1 acties overgezet."
    within(section_for("Contracten")) { assert_text "Offerte opvragen" }
  end

  test "signing out" do
    click_on "Uitloggen"
    assert_button "Inloggen"
  end

  private
    def section_for(program)
      find(:xpath, "//section[h2[text()=#{program.inspect}] or div/h2[text()=#{program.inspect}]]")
    end

    def item_row(text)
      find(".item", text: text)
    end

    def screenshot(name)
      take_screenshot(html: false, screenshot: name) if ENV["UX_SCREENSHOTS"]
    end
end
