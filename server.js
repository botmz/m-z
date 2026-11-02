const { spawn } = require("node:child_process");

const server = spawn(
  "pnpm",
  ["--filter", "@workspace/api-server", "run", "start"],
  {
    env: process.env,
    stdio: "inherit",
  },
);

server.on("error", (error) => {
  console.error("Could not start the API server:", error.message);
  process.exitCode = 1;
});

for (const [signal, exitCode] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(signal, () => {
    process.exitCode = exitCode;
    server.kill(signal);
  });
}

server.on("exit", (code) => {
  if (code !== null) {
    process.exitCode = code;
  }
});
