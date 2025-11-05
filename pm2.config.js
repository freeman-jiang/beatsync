// See: https://bun.com/docs/guides/ecosystem/pm2
module.exports = {
  name: "beatsync-server", // Name of your application
  script: "apps/server/src/index.ts", // Entry point of your application
  interpreter: "bun", // Bun interpreter
  env: {
    PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`, // Add "~/.bun/bin/bun" to PATH
  },
};
