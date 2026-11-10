---
name: comments_attributes only processes first entry on ticket create
description: The tickets_create endpoint only accepts one comment from the comments_attributes array — additional entries are silently dropped
discovered: 2026-06-24
tags: [tickets, comments, api-quirks]
---

# comments_attributes only processes first entry on ticket create

## Context

Created a ticket with two entries in comments_attributes (an opening description comment and a completion comment). Only the first comment appeared on the ticket after creation.

## What you found

The Syncro tickets_create endpoint silently drops all but the first entry in the comments_attributes array. No error is returned — you just don't get the extra comments.

## How to apply

When a ticket needs more than one initial comment:
1. Include the primary/opening description comment in comments_attributes on create (as required by the always-post-initial-comment learning).
2. Post any additional comments immediately after creation using tickets_comment, one call per comment.

## Related

- learnings/always-post-initial-comment-with-ticket-creation.md
- references/api-quirks.md
