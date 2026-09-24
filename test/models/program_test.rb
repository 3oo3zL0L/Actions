require "test_helper"

class ProgramTest < ActiveSupport::TestCase
  test "matches on name and keywords as whole words" do
    matcher = Program.matcher

    assert_equal programs(:platform_core), matcher.call("PLAT-12 Index Advisor")
    assert_equal programs(:platform_core), matcher.call("Agenda platform core overleg")
    assert_equal programs(:contracten), matcher.call("Contracten: JProfiler")
    assert_nil matcher.call("PLATFORM migratie")
    assert_nil matcher.call("Overig gedoe")
  end

  test "keywords are tidied" do
    programs(:contracten).update!(keywords: " JProfiler,, Bitbucket , JProfiler ")
    assert_equal "JProfiler, Bitbucket", programs(:contracten).keywords
  end
end
