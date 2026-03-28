# Low-Effort-Post-Alarm

Low-Effort Post Alarm is a WXT browser extension that mounts a detector panel on Reddit post pages and estimates whether a post looks low-effort, spammy, or ragebait-heavy.

It is not a moderation tool and it does not claim certainty. The score is a heuristic built from post text, author metadata, and recent posting behavior. 

This is a side project, under construction, and so far only limited effort has been invested in it.

## What it does

When you open a Reddit post URL, the content script mounts a floating panel in the bottom-right corner of the page. That panel:

- fetches the current post JSON
- fetches the author's `about` JSON when available
- fetches the author's recent submitted-post history when available
- fetches the author's recent comment history when available
- combines text signals and account-history signals into a 0-100 score
- assigns a risk level from that score
- shows the reasons that pushed the score upward

The popup is intentionally simple. It mainly confirms that the extension is installed and reminds you that the detector runs automatically on Reddit post pages.

## Panel states

The detector panel has three visual result states:

- `Warning`: the extension found substantive signals that pushed the post toward a suspicious result.
- `Inconclusive`: the extension does not have enough visible author history to make a confident call, so the panel switches to a neutral presentation instead of treating uncertainty like a warning.
- `Looks normal`: no major text or posting-history signals stand out right now.

This distinction is important because low-confidence cases, such as hidden profile data or only one visible recent post, should read as uncertainty rather than a positive flag.

## Tech stack

- WXT
- React 19 + TypeScript
- TanStack Query
- Motion
- Tailwind CSS v4
- local shadcn-style UI primitives
- Vitest

## Detector inputs

The analyzer currently considers signals such as:

- account age
- combined link and comment karma
- recent posting cadence
- burst posting inside a 24-hour window
- repeated or near-duplicate recent titles
- heavy concentration in the same subreddit
- per-subreddit post and comment frequency across visible recent activity
- moderator-removed recent submissions
- low-effort title patterns
- crosspost and NSFW context

The current scoring config lives in `features/reddit-detector/config.ts`. Right now it samples up to 40 recent posts, treats accounts under 180 days as new, and uses score thresholds of 20 / 45 / 70 for low / medium / high risk bands.

Bait-term scoring is temporarily disabled. The term list is still kept in config for later, but bait phrases are not currently contributing points or reasons while that part of the detector is under construction.

## Flags shown in the panel

| Flag | Trigger | Effect |
| --- | --- | --- |
| `New account` | Account age under 180 days | Adds an account-age warning. |
| `Low karma` | Combined karma below configured thresholds | Adds a karma warning. |
| `Moderator removals` | Recent submissions include moderator-removed posts | Adds a moderation-history warning. |
| `Thin history sample` | Only one visible recent post is available | Marks the result as lower confidence and shows the score as approximate. |
| `Profile hidden` | Author profile or submitted-post history is unavailable | Marks the result as lower confidence and shows the score as approximate. |
| `Burst posting` | Multiple sampled posts land inside the short repeat window | Adds a high-frequency posting warning. |
| `Subreddit concentration` | Recent posts are dominated by one subreddit | Adds a concentration warning. |
| `Repeated titles` | Recent titles are semantically very similar | Adds a repetition warning. |
| `Low-effort language` | Title hits low-effort title patterns | Adds text-quality warnings. |
| `Crosspost / NSFW` | Post is marked as a crosspost or NSFW | Adds small context warnings. |

## Activity breakdown

The detector panel includes a `Subreddit breakdown` section. It groups the author's visible recent activity by subreddit and shows:

- post share per subreddit as both percentage and raw count
- comment share per subreddit as both percentage and raw count

This view is informational rather than directly punitive. It helps explain whether the author is narrowly concentrated in one community or spread across multiple subreddits, without collapsing posts and comments into a single number.

## Getting started

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev:chrome
```

```bash
npm run dev:firefox
```

```bash
npm run dev:zen
```

### Build packages

```bash
npm run build:chrome
```

```bash
npm run build:firefox
```

```bash
npm run zip:chrome
```

```bash
npm run zip:firefox
```

## Project structure

- `entrypoints/popup` contains the extension popup entrypoint.
- `entrypoints/reddit-detector.content` contains the Reddit content script that mounts the detector UI.
- `features/reddit-detector/api.ts` fetches Reddit JSON for the page and the author.
- `features/reddit-detector/analysis.ts` builds the detector score, verdict, and reasons.
- `features/reddit-detector/components` contains the detector provider and panel UI.
- `features/popup` contains the popup screen shown from the browser toolbar.
- `components/ui` contains shared UI primitives.
- `tests/analysis.test.ts` covers the scoring heuristics.

## Behavior and limitations

- The extension only runs on Reddit post routes matched by the configured post-path pattern.
- Deleted authors cannot be analyzed.
- Private, hidden, or unavailable author history lowers confidence rather than pretending the signal is clean.
- The subreddit breakdown only reflects visible recent submissions and visible recent comments that Reddit returns for that author.
- Bait-term detection is currently turned off, even though the term list still exists in config for future re-enablement.
- The score is clamped to a 0-100 range, but the reasoning is intentionally surfaced so users can inspect why the extension decided a post looks risky.
- This is a heuristic detector, not a truth machine. False positives and false negatives are expected.
