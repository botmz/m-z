---
name: Free translation provider
description: The project owner's cost and data-handling requirements for automatic translation.
---

Use the direct Gemini Developer API with a model explicitly offered on Google's free tier. Do not substitute Replit AI, DeepL paid plans, or any other billable provider without the owner's approval. Never switch to a paid provider automatically when free quota is exhausted. Keep API credentials in Replit Secrets, not app settings or logs. Disclose that Google may use content sent under the free tier to improve its services, and that a Google billing-enabled project may incur charges beyond quota. For Gemini 3.x requests, omit deprecated sampling fields such as `temperature`, `top_p`, and `top_k`.

**Why:** The owner said they do not have a DeepL account and asked for Gemini free or another free API. Google's current Gemini 3.x guidance deprecates sampling parameters, which can make requests fail as API versions evolve.

**How to apply:** Keep translation on the direct, fixed free-tier Gemini model; omit deprecated sampling parameters and preserve the source's existing failure policy if quota or rate limits are reached.
