# Learnings

This folder is the **append-only log** of things Claude has discovered while working with SyncroMSP. The main `SKILL.md` and `references/*.md` represent stable, validated patterns. This folder captures fresh observations *before* they've been promoted.

## When to add a learning

Add a learning whenever you encounter something that should persist beyond the current conversation:

- A tool returned an error you didn't expect, and you found a workaround
- A field/parameter behaves differently than documented
- A pattern that helped get something done faster
- A user correction you should remember next time
- An edge case in a workflow (e.g. "if customer has no email, X behaves differently")

## Format

Each learning is a single markdown file: `<short-kebab-topic>.md`

```markdown
---
name: <short title>
description: <one line — what was learned, used by future sessions to decide relevance>
discovered: <YYYY-MM-DD>
tags: [tickets, billing, api, etc.]
---

# <Title>

## Context
What were you trying to do?

## What you found
The actual behavior / quirk / pattern. Be specific — exact tool names, exact field values, exact error messages.

## How to apply
When this matters, what should you do differently? This is the actionable part.

## Related
Optional pointer to a reference file or another learning.
```

## Reading order

When starting non-trivial SyncroMSP work, **scan all files in this folder first**. They may modify default skill behavior before they've been promoted into the references.

Specifically, when you've called a `Skill` for syncromsp:

1. Read SKILL.md (entry point — already done if you got here)
2. Read all `learnings/*.md` (this folder)
3. Read the relevant `references/*.md` for the domain

## Promoting to references

When a learning has been validated across multiple sessions and is no longer surprising:

1. Fold its content into the appropriate `references/*.md` file (typically `api-quirks.md` for API behavior).
2. Delete the learning file.
3. Note the promotion in the same edit ("promoted from learnings/foo.md").

This keeps the references authoritative and prevents the learnings folder from accumulating stale notes.

## What does NOT belong here

- Company-specific data (client names, user IDs, product IDs) — those go in `config.json` or the user's CLAUDE.md.
- Conversation-specific state (current ticket numbers, in-progress work) — that's not "learning", that's session context.
- Duplicate content already in the references — update the reference instead.
