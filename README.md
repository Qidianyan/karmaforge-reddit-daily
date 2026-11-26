# KarmaForge · Daily Thread Architect (V6 Dark Terminal Edition)

> **A 60-second Reddit Devvit Web daily causal thread puzzle where Redditors connect two posts via a 4-link chain, challenge Iron Forge hard mode, compare against Global Crowd Consensus %, play and upvote Community Forge UGC threads, and climb 3 live leaderboards.**

Built for the **Devpost × Reddit Daily Games Hackathon 2026** (`$35,000` prize pool) with `@devvit/web` v0.15.4, React 19, TypeScript, Express, and Devvit Redis.

---

## Core Features (V6)

- **60 Handcrafted Reddit-Native Daily Editions + 60-Day Streak Heatmap**: 60 curated puzzles (`src/shared/puzzles-part1.ts` through `puzzles-part4.ts`) spanning 8 classic Reddit communities (*Science, Retro Tech, Cooking, Cinema, Worldbuilding, Nature, History, Internet Culture*), backed by a deterministic 365-day UTC calendar and a filterable **60-Day Archive Streak Heatmap** (Obsidian / Emerald / Amber / Flame).
- **Iron Forge Hard Mode (`3 Tries · Strict Clues · +25% Karma`)**: Toggle **Iron Forge** directly in the masthead before your first attempt to lock into 3 max attempts, strict clue discipline (clues disabled on the final try), a `+25%` Karma bonus, and an upgraded `⚒️ IRON FORGE` crest on spoiler-free comment share cards and the **Iron Forge Hall** leaderboard.
- **Global Crowd Consensus % Histogram**: Every victory modal renders a deterministic Bayesian-prior + live Redis attempt histogram (`Sharper than XX% of r/KarmaForge`) showing exact try-count distributions across the subreddit.
- **Full Playable Community Forge UGC Playground**: Switch to **Community Forge** to compose a live-validated 4-Link + 2-Troll puzzle in 30 seconds (`POST /api/community/puzzles`), cast persistent upvotes for tomorrow's daily ballot (`POST /api/community/vote`), OR click **`Play Thread`** on any community card to play it immediately inside the embedded board (`/api/community/play/:id`, `/guess`, `/hint`, `/share`) — incrementing real `plays`, `clears`, `clearRatePct`, awarding **`+50 Creator Karma`** to the author, and generating spoiler-free `u/<author>` share cards with zero pollution to Daily streak or leaderboard state.
- **3-Tab Live `Ranks & Forgers` Terminal**: Track daily speedrunners (`Daily Speedrun`), hardcore 3-try finishers (`Iron Forge Hall`), and prolific puzzle creators (`Top Forgers` ranked by Creator Karma, clears, and upvotes).
- **3-Second Zero-Friction Micro-Guidance + Exact Lock Tactile Feedback**: First-time visitors immediately see an inline warm-gold 3-step micro-hint (`1. Pick or press 1–6 · 2. Forge 4-link chain · 3. Dodge 2 trolls`, auto-dismissed on the first card placement), while verified exact-slot locks trigger a mechanical rebound pulse with subtle amber/emerald forge sparks (`prefers-reduced-motion` safe) and browser-native procedural Web Audio clicks and anvil chimes.
- **Dark Terminal Geek × Reddit Flame Orange UI & 375px First-Fold Ergonomics**: Pure obsidian `#101010`, deep charcoal `#191918`, warm ivory `#EFECE6`, Reddit flame `#FF4500`, emerald lock `#36C96E`, amber warning `#F5B731`, and 1px `#2D2C2A` rules (zero blue/cyan/teal/purple hues). Responsive `@container` layout keeps Opening Post + Slots #1–#3 visible above the fold on `375×667` mobile with zero horizontal overflow (`320px`–`1920px`).

---

## How to Play

1. **Read the Anchors**: Each UTC calendar day (`YYYY-MM-DD`) opens a fresh edition featuring an **Opening Post (`OP`)** and a **Finale Post (`FINALE`)**.
2. **Choose Standard or Iron Forge**: Play standard mode (5 attempts) or flip **Iron Forge** in the masthead (3 attempts, strict clues, `+25%` Karma, `⚒️ IRON FORGE` badge) before submitting guess #1.
3. **Forge the 4-Link Thread**: Between `OP` and `FINALE` sit **4 Thread Slots** and **6 Candidate Bridge Posts** — 4 form the true causal/associative chain and 2 are plausible **Off-Topic Red Herrings / Trolls**.
4. **Keyboard Speedflow, Tap, or Drag-and-Drop**: Press `1`–`6` to slot cards, `Enter` to forge, `Z` to undo, `H` to reveal a Top Comment clue, `↑`/`↓` to navigate unlocked slots, or drag & drop (with touch-friendly quick-swap arrows).
5. **Read Instant Terminal Feedback**:
   - **Emerald Lock (`Exact Lock`, `#36C96E`)**: Right bridge post in the exact slot. Auto-locks with rebound & forge sparks for remaining tries.
   - **Amber Signal (`Wrong Order`, `#F5B731`)**: Right bridge post, wrong slot. Move it earlier or later along the thread spine.
   - **Charcoal Strike (`Off-Topic Troll`)**: Plausible myth or tangent. Swap it out for a true chain link.
6. **Streak Flairs, Pixel Badges, Consensus % & Community Forge**:
   - Maintain a daily UTC streak to unlock 5 subreddit flairs (`Lurker` → `Commenter` → `Thread Weaver` → `Mod Favorite` → `Front Page Sage`) and **3 custom 16-bit pixel badges** (`badge_lurker.png`, `badge_weaver.png`, `badge_sage.png`).
   - Post your spoiler-free emoji grid (with `⚒️ IRON FORGE` crest when earned, Speed Combo multiplier, Global Crowd Consensus %, and Karma) directly to the Reddit comment thread via `reddit.submitComment` (with automatic clipboard fallback).
   - Jump into **Community Forge** to play community-authored threads (awarding `+50 Creator Karma`) or publish your own nominee for tomorrow's official daily edition.

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
│   │   ├── types.ts                # Shared domain, Iron Forge, Consensus %, Ranks & Community UGC contracts
│   │   ├── puzzles-part1.ts        # Handcrafted curated puzzles #1–#15
│   │   ├── puzzles-part2.ts        # Handcrafted curated puzzles #16–#30
│   │   ├── puzzles-part3.ts        # Handcrafted curated puzzles #31–#45
│   │   ├── puzzles-part4.ts        # Handcrafted curated puzzles #46–#60
│   │   ├── puzzles.ts              # Unified 60-puzzle catalog (8 Reddit communities)
│   │   ├── daily.ts                # Deterministic 365-day UTC calendar & Mulberry32 shuffle engine
│   │   ├── engine.ts               # Authoritative grading, Iron Forge, Consensus %, Speed Combo, Karma & streak rollover
│   │   ├── flair.ts                # Community flair ladder & 3-badge pixel catalog
│   │   ├── communityForge.ts       # Real-time 4-Link + 2-Troll UGC validation, presets & ballot sorting
│   │   └── share.ts                # Spoiler-free Reddit markdown share generator (Daily + Iron Forge + Community UGC)
│   ├── server/
│   │   ├── storage.ts              # Redis-compatible KvStore + file-backed local adapter
│   │   ├── service.ts              # Daily state, Iron Forge, Consensus histogram, 3-tab Ranks & playable UGC sessions
│   │   ├── app.ts                  # Express router (/api/* + /api/community/play/:id/* + Devvit /internal/* triggers)
│   │   ├── index.ts                # Production Devvit Web server (@devvit/web/server + redis + reddit)
│   │   └── server-local.ts         # Standalone local Node/Express runner (real persistence, zero mocks)
│   └── client/
│       ├── index.html              # CSP-safe dark-theme webview shell (#101010, zero external CDN fonts)
│       ├── styles.css              # Dark Terminal Geek × Reddit Flame Orange CSS (@container, 4px scale, Exact Lock sparks)
│       ├── sound.ts                # Optional procedural WebAudio tactile clicks & anvil chimes
│       ├── api.ts                  # Typed client API wrapper (daily, archive, 3-tab ranks, community vote & UGC play)
│       ├── App.tsx                 # Dual-tab board (Daily + Iron Forge + Micro-Guide + Playable UGC Overlay + DnD)
│       └── components/
│           ├── BrandMark.tsx       # Inline SVG obsidian/flame anvil mark & terminal UI icons
│           ├── BadgeVault.tsx      # 3-badge retro pixel achievement showcase wall
│           ├── CommunityForge.tsx  # Tomorrow's ballot, live Play Thread cards & 30s live-validated puzzle composer
│           ├── BroadsheetDialog.tsx # Native <dialog closedby="any"> modal with progressive fallback
│           └── Modals.tsx          # Victory/Consensus Share Card, 3-Tab Ranks & Forgers, 60-Day Archive Heatmap, Rules
├── scripts/
│   ├── build-server.mjs            # esbuild CJS bundler -> dist/server/index.cjs
│   └── e2e-verify.ts               # Playwright E2E suite (760×620 desktop + 375×667 mobile + Iron Forge + Playable UGC + 3-Tab Ranks)
└── tests/
    └── karmaforge.test.ts          # 34-test Vitest unit, HTTP integration, Devvit schema, Iron Forge, Consensus, UGC & palette suite
```

---

## Local Development & Verification

```bash
# 1. Install dependencies
npm install

# 2. Type-check, run 34-test Vitest suite, and build client + Devvit server bundles
npx tsc --noEmit
npm test
npm run build

# 3. Launch standalone local playable preview (serves built client + real persisted API on :4173)
npm run dev
# Open http://127.0.0.1:4173 in your browser

# 4. Run full Playwright end-to-end verification (760x620 desktop, 375x667 mobile, Iron Forge, UGC play & 3-tab ranks)
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
