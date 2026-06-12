// See: https://bun.com/docs/guides/ecosystem/pm2
module.exports = {
  name: "beatsync-server", // Name of your application
  cwd: "apps/server",
  script: "dist/index.js", // Bundled entry point
  // Resolve bun through mise shims so the version comes from this repo's
  // mise.toml pin, not a stale standalone install (~/.bun/bin/bun).
  interpreter: `${process.env.HOME}/.local/share/mise/shims/bun`,
};
