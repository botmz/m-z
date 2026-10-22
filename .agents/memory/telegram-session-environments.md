---
name: Telegram session environments
description: Distinguish development and production PostgreSQL when checking saved Telegram sessions.
---

Development and production PostgreSQL are separate for Telegram session checks. A session present in production may be absent from the local development database, so restarting the development workflow does not validate production recovery.

**Why:** A production QR authorization persisted and restored while the development database had no saved Telegram session.

**How to apply:** Check only safe session-presence and worker-health fields in the environment being validated. Never copy or print session contents between environments.
