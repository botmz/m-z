---
name: Telegram link filtering
description: Source-message link removal behavior and content preservation.
---

When the source's link-removal option is enabled, remove the links from message text while preserving the rest of the text and attached media. For hidden Telegram text-link entities, keep the visible label as plain text. Never skip a whole post only because it contains a link.

Links explicitly entered by the owner in configured source prefixes/suffixes or destination signatures are intentional and must remain in forwarded messages. The link-removal option applies to incoming source-message content, not to these configured additions. Keep route-level source-reference removal separate so it removes only the selected source's references.

**Why:** The owner wants to remove links without losing useful message content or attached media.

**How to apply:** Sanitize incoming message content before filtering, translation, and delivery; preserve configured prefixes, suffixes, and destination signatures; rebuild unstarted queued plans when this behavior changes, and preserve existing routing and translation fallback settings.
