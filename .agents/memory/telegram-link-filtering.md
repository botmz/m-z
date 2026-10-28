---
name: Telegram link filtering
description: Source-message link removal behavior and content preservation.
---

When the source's link-removal option is enabled, remove the links from message text while preserving the rest of the text and attached media. For hidden Telegram text-link entities, keep the visible label as plain text. Never skip a whole post only because it contains a link.

**Why:** The owner wants to remove links without losing useful message content or attached media.

**How to apply:** Sanitize before filtering, translation, and delivery; apply the same behavior to queued messages, and preserve the existing source-to-destination routing and translation fallback settings.
