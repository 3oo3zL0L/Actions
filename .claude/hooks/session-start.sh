#!/bin/bash
# Maakt een Claude Code-sessie in de cloud klaar voor bin/ci: gems, testdatabase en een Chrome
# met bijpassende chromedriver voor de systeemtests.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

cd "$CLAUDE_PROJECT_DIR"
bundle install --quiet
bin/rails db:test:prepare

manager=$(bundle exec ruby -e 'print Gem.loaded_specs["selenium-webdriver"].full_gem_path')/bin/linux-x86_64/selenium-manager
paths=$("$manager" --browser chrome --skip-driver-in-path --output json)
{
  echo "export CHROME_BIN=$(ruby -rjson -e 'print JSON.parse(ARGF.read).dig("result", "browser_path")' <<< "$paths")"
  echo "export SE_CHROMEDRIVER=$(ruby -rjson -e 'print JSON.parse(ARGF.read).dig("result", "driver_path")' <<< "$paths")"
} >> "$CLAUDE_ENV_FILE"
