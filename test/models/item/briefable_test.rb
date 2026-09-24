require "test_helper"

class Item::BriefableTest < ActiveSupport::TestCase
  test "brief carries what Claude needs to pick the action up" do
    brief = items(:jprofiler).brief

    assert_includes brief, "Actie: JProfiler-licentie verlengen"
    assert_includes brief, "Programma: Contracten"
    assert_includes brief, "Ligt bij: Kim"
    assert_includes brief, "Deadline: #{I18n.l(items(:jprofiler).due_on, format: :long)}"
  end

  test "brief flags late actions and leaves out what is empty" do
    brief = items(:snapshot).brief

    assert_includes brief, "(verlopen)"
    assert_not_includes brief, "Ligt bij"
    assert_not_includes brief, "Mail:"
  end

  test "brief says why it is on today" do
    assert_includes items(:index_advisor).brief, "Waarom vandaag: Staat vandaag om 10:30 in de standup"
  end
end
