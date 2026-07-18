// Seed data for the INITIAL build only (see AGENTS.md "Seed data & data preservation").
// The Codex agent replaces the body of `seed()` with realistic demo data inserts
// so the app never shows an empty screen on first load.

async function seed(): Promise<void> {
  // Blank template has no tables — nothing to seed yet.
}

seed()
  .then(() => {
    console.log('Seed complete.');
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
