module.exports = {
  apps: [{
    name: "mz-telegram-bots",
    cwd: __dirname,
    script: "artifacts/api-server/dist/index.mjs",
    node_args: "--env-file=/etc/mz-telegram-bots.env",
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    watch: false,
    min_uptime: "10s",
    max_restarts: 10,
    restart_delay: 3000,
    exp_backoff_restart_delay: 100,
    kill_timeout: 60000,
    listen_timeout: 10000,
    env_production: {
      NODE_ENV: "production",
      PORT: "3000",
      MZ_AUTO_MIGRATE: "true",
    },
  }],
};
