---
name: Syncro text fields render as plain text, not markdown
description: Ticket comments, invoice notes, and any user-visible text field in Syncro show markdown syntax literally — strip all markdown before posting
discovered: 2026-05-01
tags: [tickets, comments, billing, formatting, ui]
---

# Syncro text fields render as plain text, not markdown

## Context

User created a monthly maintenance ticket and the public comment body was authored in markdown (`**Search engine optimization**`, `**Website speed**` headings, hyphen bullets). When the ticket rendered in the Syncro web UI, the asterisks showed up literally — `**Search engine optimization**` instead of bolded "Search engine optimization". The customer-facing record looked like raw text with stray punctuation.

## What you found

Syncro does NOT parse markdown in any text field it stores and re-renders. Confirmed surfaces:

- Ticket comment `body` and `subject`
- Ticket `subject` and `body`
- Invoice and estimate `notes`
- Appointment `notes` / `description`
- Wiki and worksheet content (mostly — wiki is HTML-aware in some views but not safe to assume markdown)
- Customer `notes`

What renders cleanly in plain text:

- Plain ASCII characters, including hyphens (`- item` for bullets)
- Numbered lists (`1.`, `2.`)
- Blank lines for paragraph breaks
- ALL CAPS or `Trailing colon:` for section emphasis
- Bare URLs on their own line — Syncro auto-linkifies most of these in the UI

What does NOT render and shows literally:

- `**bold**` → shows the asterisks
- `*italic*` / `_italic_` → shows the underscores/asterisks
- `# Headings` → shows the hash signs
- `[text](url)` → shows the brackets and parens around the URL
- Backticks for inline code or fences → shows the backticks
- `> blockquote` → shows the angle bracket

## How to apply

1. **Default to plain text for every string that will end up in a Syncro field.** This includes ticket comments (public AND private — both render the same way), ticket bodies, invoice/estimate notes, appointment notes.
2. **When the source content is markdown** (e.g. user pastes a markdown report, or you're translating from a doc you generated): strip the syntax before posting. Convert `**X**` to `X` (or `X:` for headings), drop `[text](url)` to bare URL, remove backticks, drop `#` characters.
3. **Use structural plain-text equivalents:**
   - Section headings → ALL CAPS line, optionally followed by blank line
   - Subsection headings → `Title Case With Trailing Colon:`
   - Bold inline emphasis → ALL CAPS or just trust the surrounding sentence
   - Code/identifiers → drop the backticks, the identifier alone reads fine
   - Links → put the URL on its own line under the descriptive text
4. **Don't confuse this with the chat-output hyperlink rule.** When talking to the user in Claude (chat), continue to render Syncro records as `[Ticket #1234](https://...)` markdown links. The "plain text" rule only applies to strings being sent INTO Syncro.
5. **When in doubt, draft and show the user before posting.** If they approve, post as-is.

### Conversion example

Markdown source (from a maintenance report):

```
**Search engine optimization**
- Shortened the homepage title and description
- Allowed AI assistants to read the site
- Added a small file that summarizes the business

**Website speed**
- Replaced 13 oversized photos with a smaller modern format
```

Posted to a Syncro comment:

```
SEARCH ENGINE OPTIMIZATION
- Shortened the homepage title and description
- Allowed AI assistants to read the site
- Added a small file that summarizes the business

WEBSITE SPEED
- Replaced 13 oversized photos with a smaller modern format
```

## Related

- `SKILL.md` — "Plain text only in Syncro fields" core rule
- `references/tickets.md` — comment workflow notes the plain-text constraint
