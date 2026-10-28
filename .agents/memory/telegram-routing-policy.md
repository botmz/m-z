---
name: Telegram routing policy
description: Owner-selected source-to-destination routing and protection against accidental broadcasts.
---

Only explicitly saved source-to-destination relationships may create deliveries. Never infer that enabled channels should all receive messages. A source may have multiple destinations when the owner selects them, and one destination may receive from multiple sources. Saving one source's routes must not overwrite other sources' routes. Do not replay messages received before a route was configured unless the owner explicitly asks; replay can publish unexpected or duplicate content.

The option to hide a source reference belongs to an individual saved source-to-destination route. It must not affect another destination for the same source, and it should remove only references to that source while preserving unrelated links.

Each source-message/destination pair must produce at most one delivery, including when workers race. Ambiguous Telegram sends must not be automatically retried because Telegram may already have accepted them.

Deduplicate source posts by Telegram message ID only. Do not discard a different post merely because its text resembles an earlier one or its price values changed.

**Why:** The owner asked to choose destinations manually, avoid broadcasting, and prevent duplicate delivery while preserving separate market updates.

**How to apply:** Preserve explicit routing at the UI, API, and queue layers; deduplicate by Telegram message ID; atomically claim a queued delivery before sending; keep ambiguous sends for manual inspection; keep source-scoped updates isolated; store hide-source settings per route; require owner confirmation before backfilling old messages.
