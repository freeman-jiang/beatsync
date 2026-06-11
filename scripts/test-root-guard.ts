// Preloaded by the ROOT bunfig.toml's [test] section only. Bare `bun test` at
// the repo root discovers every app's test files but applies none of their
// per-app bunfig preloads (bun only reads bunfig from the cwd), so the client
// suite fails with confusing "document is not defined" errors. Exit fast with
// directions instead (a thrown error would be logged but would not stop the run).
console.error(
  "\nDon't run `bun test` from the repo root — per-app test configs (happy-dom preloads) won't load.\n" +
    "Use one of:\n" +
    "  bun run test            # turbo: runs every app's suite with its own config\n" +
    "  cd apps/server && bun test\n" +
    "  cd apps/client && bun test\n"
);
process.exit(1);
