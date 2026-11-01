---
name: GitHub repository access
description: How Replit's Repositories connection differs from the Agent GitHub connector.
---

The Replit Repositories page can authorize the local GitHub CLI through Replit's secure GitHub proxy, even when the Agent GitHub API connector reports no connection. The CLI can still resolve the external GitHub profile URL and create or push to the user's actual GitHub repository.

**Why:** Replit exposes repository access through a different path than the Agent connector, so an empty connector list does not prove that the user's GitHub connection is unavailable.

**How to apply:** When a user says GitHub is connected through Repositories, verify with a read-only `gh api user` request and use the authenticated `gh` CLI. Do not request or print credentials; keep repositories private when requested and inspect ignore rules before pushing.
