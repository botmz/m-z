---
name: Free translation provider
description: The project owner's cost and data-handling requirements for automatic translation.
---

Keep direct Gemini Developer API on an explicitly free-tier model as the default. The owner may manually choose their own OpenAI API only when they provide its key and a live test succeeds; do not use Replit's AI integration credentials as that key. Never switch providers automatically when free quota is exhausted. Keep credentials in Replit Secrets, not app settings or logs. Disclose that Google may use free-tier content to improve services and that billing-enabled projects may incur charges beyond quota. For Gemini 3.x, omit deprecated sampling fields such as `temperature`, `top_p`, and `top_k`.

**Why:** The owner does not have a DeepL account and prefers Gemini's free tier, while allowing a deliberate OpenAI option only with their own key and a successful test. Google's current Gemini 3.x guidance deprecates sampling parameters, which can make requests fail as API versions evolve.

**How to apply:** Keep Gemini selected by default, allow only currently documented free Gemini models, require a live provider/model test before activation, omit deprecated sampling parameters, and preserve each source's configured failure policy.
