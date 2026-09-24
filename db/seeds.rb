# De PAF-programma's, in de volgorde waarin Thomas ze doorloopt.
[ "UI/UX", "Platform Core", "CI Acceleration", "OIDC", "Object Store", "Jakarta migratie",
  "Platform Stability", "Contracten", "Overig" ].each_with_index do |name, position|
  Program.find_or_create_by!(name: name).update!(position: position)
end
