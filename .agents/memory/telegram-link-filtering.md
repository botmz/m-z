---
name: Telegram link filtering
description: Source-message link removal behavior and content preservation.
---

When a route's link-removal option is enabled, remove links from source-message text while preserving the rest of the text and attached media. For hidden Telegram text-link entities, keep the visible label as plain text. Never skip a whole post only because it contains a link.

Generated market-price text is outside the URL filter and remains. When route link removal is enabled, strip URLs from configured destination signatures but preserve their surrounding words. Keep route-level source-reference removal separate so it removes only the selected source's references.

**Why:** The owner wants to remove links without losing useful message content or attached media.

**How to apply:** Sanitize source content before delivery; preserve configured prefixes, suffixes, and destination signatures; rebuild unstarted queued plans when link handling changes; keep route-specific filters isolated.
