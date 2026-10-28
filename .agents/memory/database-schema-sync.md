---
name: Database schema sync
description: Schema history differs from the current development database.
---

The development PostgreSQL database already contained schema changes that are absent from the initial Drizzle migration history. A generated migration may therefore include unrelated objects or columns that already exist in development.

**Why:** Applying generated SQL directly to the existing development database can fail on duplicate objects, and production schema changes must be reviewed through the supported publish flow.

**How to apply:** Update the Drizzle schema source, use `pnpm --filter @workspace/db run push` only for development, and let Publish calculate the production schema diff. Do not manually run generated migration SQL against production.
