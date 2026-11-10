---
name: Always post initial description comment when creating tickets
description: Every ticket must include an initial public comment describing the work at creation time — use comments_attributes in tickets_create, not a separate follow-up call
discovered: 2026-06-12
tags: [tickets, comments, workflow]
---

# Always post initial description comment when creating tickets

## Context

Created a ticket for a planned server upgrade without including a description comment. Had to add it manually after creation as a second API call.

## What you found

The tickets_create endpoint accepts a `comments_attributes` array that lets you post the initial comment atomically with the ticket. This is the correct approach — not creating the ticket first and commenting after.

## How to apply

Every ticket creation must include an initial public comment via `comments_attributes` describing the work. Use subject `Issue` for incidents/problems or `Upgrade` for upgrades/change requests. Always set `hidden: false` and `do_not_email: true` unless the customer needs an email notification.

```json
{
  "comments_attributes": [{
    "body": "DESCRIPTION OF WORK\n\n...",
    "subject": "Issue",
    "hidden": false,
    "do_not_email": true
  }]
}
```

The ticket `body` field is internal tech context. The comment is the visible description of the work — both are required.

Never create a ticket without a comment. If you realize you forgot, add it immediately via tickets_comment before reporting the ticket as done.

## Related

- references/tickets.md — "Initial comment at creation" section
