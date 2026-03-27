# Low-Effort Post Alarm

A WXT-powered browser extension that scores Reddit post pages for low-effort, spammy, or ragebait-like signals.

## Stack

- WXT + Vite
- React + TypeScript
- TanStack Query
- Motion
- Tailwind CSS v4
- shadcn/ui-style components
- Vitest

## Scripts

- `npm run dev:chrome` starts the Chrome-targeted WXT dev runner.
- `npm run dev:firefox` starts the Firefox-targeted WXT dev runner.
- `npm run build` builds the Chrome bundle.
- `npm run build:firefox` builds the Firefox bundle.
- `npm test` runs the heuristic tests with a Windows-safe Vitest config.
- `npm run typecheck` runs `tsc --noEmit`.

## What the detector checks

- account age
- link karma and comment karma
- recent posting cadence
- repeated titles in recent submissions
- repeated posting inside a 24-hour window
- bait phrases in the title or body
- short or punctuation-heavy titles
- crosspost and NSFW signals

## Project shape

- `entrypoints/popup` contains the popup UI.
- `entrypoints/reddit-detector.content` mounts the detector panel on Reddit post pages.
- `features/reddit-detector` contains the JSON fetch layer plus the scoring heuristics.
- `components/ui` contains the local shadcn-style primitives used by the popup and panel.
- `tests/analysis.test.ts` covers the core scoring rules.
