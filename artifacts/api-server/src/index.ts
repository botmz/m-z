import app from "./app";
import { logger } from "./lib/logger";
import { initializeAdmin } from "./lib/auth";
import { applyDatabaseMigrations } from "./lib/db-migrations";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startWorker, stopWorker } from "./lib/worker";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

if (process.env.MZ_AUTO_MIGRATE === "true") {
  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../lib/db/drizzle",
  );
  logger.info("Applying PostgreSQL migrations before admin initialization");
  await applyDatabaseMigrations(migrationsFolder);
  logger.info("PostgreSQL migrations applied; required tables verified");
}
await initializeAdmin();
const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startWorker();
});
process.on("SIGTERM", () => {
  void stopWorker().finally(() => server.close(() => process.exit(0)));
});
