# KarmaForge · Daily Thread Architect (V2 Dark Terminal Edition)

> **A 60-second Reddit Devvit Web daily puzzle game where players connect two Reddit posts by forging a 4-link subreddit thread, dodging two plausible off-topic red herrings, collecting retro pixel badges, and voting on tomorrow’s Community Forge daily edition.**

Built for the **Devpost × Reddit Daily Games Hackathon 2026** (`$35,000` prize pool) with `@devvit/web` v0.15.4, React 19, TypeScript, Express, and Devvit Redis.

---

## What’s New in V2

- **Dark Terminal Geek × Reddit Flame Orange Visual System**: Pure obsidian charcoal `#101010`, deep charcoal cards `#191918`, warm terminal ivory `#EFECE6`, iconic Reddit flame orange `#FF4500`, precision emerald lock `#36C96E`, amber order warning `#F5B731`, and crisp 1px `#2D2C2A` borders (strictly zero blue/cyan/teal/purple hues, verified mechanically via `sloplint` across 8 Chromium viewports).
- **Community Forge (UGC Tomorrow’s Daily Workshop)**: Switch to the **Community Forge** tab to draft and live-validate your own 4-Link + 2-Troll thread puzzle in 30 seconds, submit it to the Devvit Redis / local KV queue (`/api/community/puzzles`), and upvote community nominees (`/api/community/vote`) competing to become tomorrow’s pinned daily edition.
- **Speed Combo Multiplier + Retro Pixel Badge Wall**: Fast solves earn live combo tiers (`2.0x Flash Forge`, `1.5x Speed Runner`, `1.25x Sharp Thread`) stacked with streak bonuses, unlocking 3 bespoke 16-bit retro pixel achievement badges (`public/art/badge_lurker.png`, `badge_weaver.png`, `badge_sage.png`).
- **Keyboard Speedflow + Smooth Drag-and-Drop + 3D Flip Lock + Mechanical Web Audio**: Press `1`–`6` to slot cards, `Enter` to forge, `Z` to undo, `H` to reveal a Top Comment clue, `↑`/`↓` to jump slots, or drag & drop (and use inline quick-swap arrows) with staggered 3D card flip-and-lock feedback and pure browser-native Web Audio mechanical keycap clicks & anvil lock pings.
- **30-Day Archive Streak Heatmap**: Open the **Archive** terminal to inspect a 30-day Obsidian/Emerald/Amber/Flame daily solve heatmap and jump straight into any handcrafted edition.

---

## How to Play

1. **Read the Anchors**: Each UTC calendar day (`YYYY-MM-DD`) opens a fresh edition featuring an **Opening Post (`OP`)** and a **Finale Post (`FINALE`)**.
2. **Forge the 4-Link Thread**: Between the anchors sit **4 Thread Slots** and a hand of **6 Candidate Bridge Posts** — 4 form the causal/associative bridge from start to finish, and 2 are plausible **Off-Topic Red Herrings / Trolls**.
3. **Keyboard Speedflow, Tap, or Drag-and-Drop**: Press keys `1`–`6`, tap cards to slot, drag & drop across slots to swap, or use `Z` to undo any step.
4. **Read Instant Terminal Feedback** (≤ 5 attempts):
   - **Emerald Lock (`Exact Lock`, `#36C96E`)**: Right bridge post in the exact slot. Auto-locks in place for remaining attempts.
   - **Amber Signal (`Wrong Order`, `#F5B731`)**: Right bridge post, wrong slot. Drag or swap it earlier or later along the spine.
   - **Charcoal Strike (`Off-Topic Troll`)**: Plausible myth or tangent. Remove it and pick a true chain link.
5. **Progressive Top Comment Clues**: Press `H` or click **Reveal Clue** to view up to **2 witty Reddit Top Comment Clues** without spoiling the full solution.
6. **Streak Flairs, Pixel Badges & 1-Click Spoiler-Free Share**:
   - Build a daily UTC streak to collect retro 16-bit pixel badges and subreddit flairs:
     - **Day 1**: `Lurker` (`badge_lurker.png`)
     - **Day 3**: `Commenter`
     - **Day 7**: `Thread Weaver` (`badge_weaver.png`)
     - **Day 14**: `Mod Favorite`
     - **Day 30**: `Front Page Sage` (`badge_sage.png`)
   - Post your upgraded spoiler-free emoji grid (with Speed Combo multiplier & Karma score) straight into the daily post thread with 1 click (`reddit.submitComment` in Devvit, with automatic clipboard copy fallback).

---

## Architecture

```text
karmaforge-daily/
├── devvit.json                     # Validated Devvit Web v0.15 manifest (client, server, Redis, Reddit, cron, mod menu)
├── public/
│   └── art/
│       ├── badge_lurker.png        # 16-bit retro pixel badge (Day 1 Lurker)
│       ├── badge_weaver.png        # 16-bit retro pixel badge (Day 7 Thread Weaver)
│       └── badge_sage.png          # 16-bit retro pixel badge (Day 30 Front Page Sage)
├── src/
│   ├── shared/
│   │   ├── types.ts                # Shared domain, Speed Combo & Community Forge API contracts
│   │   ├── puzzles-part1.ts        # Handcrafted curated puzzles #1–#15
│   │   ├── puzzles-part2.ts        # Handcrafted curated puzzles #16–#30
│   │   ├── puzzles.ts              # Unified 30-puzzle catalog (8 Reddit topics)
│   │   ├── daily.ts                # Deterministic 365-day UTC calendar & Mulberry32 shuffle engine
│   │   ├── engine.ts               # Authoritative grading, Speed Combo multiplier, Karma & streak rollover
│   │   ├── flair.ts                # Community flair ladder & 3-badge pixel catalog
│   │   ├── communityForge.ts       # Real-time 4-Link + 2-Troll UGC validation, presets & ballot sorting
│   │   └── share.ts                # Upgraded spoiler-free Reddit markdown share generator
│   ├── server/
│   │   ├── storage.ts              # Redis-compatible KvStore + file-backed local adapter
│   │   ├── service.ts              # Daily state, leaderboard, comment feed & Community Forge Redis vote queue
│   │   ├── app.ts                  # Express router (/api/* + /api/community/* + Devvit /internal/* triggers)
│   │   ├── index.ts                # Production Devvit Web server (@devvit/web/server + redis + reddit)
│   │   └── server-local.ts         # Standalone local Node/Express runner (real persistence, zero mocks)
│   └── client/
│       ├── index.html              # CSP-safe dark-theme webview shell (#101010, zero external CDN fonts)
│       ├── styles.css              # Dark Terminal Geek × Reddit Flame Orange CSS (@container, 4px scale)
│       ├── sound.ts                # Optional procedural WebAudio tactile clicks & chimes
│       ├── api.ts                  # Typed client API wrapper (daily + archive + leaderboard + community forge)
│       ├── App.tsx                 # Dual-tab board (Daily Forge + Community Forge + Keyboard Speedflow + DnD)
│       └── components/
│           ├── BrandMark.tsx       # Inline SVG obsidian/flame anvil mark & terminal UI icons
│           ├── BadgeVault.tsx      # 3-badge retro pixel achievement showcase wall
│           ├── CommunityForge.tsx  # Tomorrow's daily upvote ballot & 30s live-validated thread composer
│           ├── BroadsheetDialog.tsx # Native <dialog closedby="any"> modal with progressive fallback
│           └── Modals.tsx          # Victory/Debrief Share Card, Leaderboard, Archive Terminal, Rules
├── scripts/
│   ├── build-server.mjs            # esbuild CJS bundler -> dist/server/index.cjs
│   └── e2e-verify.ts               # Playwright 5-screenshot E2E suite (760×620 desktop + 375×667 mobile)
└── tests/
    └── karmaforge.test.ts          # 19-test Vitest unit, HTTP integration, Devvit schema, heatmap, audio & dark palette suite
```

---

## Local Development & Verification

```bash
# 1. Install dependencies
npm install

# 2. Type-check, run 17-test Vitest suite, and build client + Devvit server bundles
npx tsc --noEmit
npm test
npm run build

# 3. Launch standalone local playable preview (serves built client + real persisted API on :4173)
npm run dev
# Open http://127.0.0.1:4173 in your browser

# 4. Run full Playwright 5-screenshot end-to-end verification (desktop 760x620 + mobile 375x667)
npm run test:e2e
```

---

## Deploying to Reddit with Devvit CLI

Make sure the bundled `@devvit/cli` v0.15.4 is on your `PATH` (`source ../env.sh` from `code/karmaforge-daily/`):

```bash
source ../env.sh
devvit login
npm run build
devvit upload
devvit playtest <your-test-subreddit>
```

Once installed on a subreddit, open the subreddit moderation menu and choose **"Post KarmaForge Daily Thread"** (or let the midnight UTC scheduler post automatically via `/internal/cron/daily-post`).
