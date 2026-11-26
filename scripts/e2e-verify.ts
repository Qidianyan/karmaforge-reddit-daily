import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { getPuzzleForDate, getUtcDateKey } from '../src/shared/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const materialsDir = path.resolve(projectRoot, '../../materials');
const shotsDir = path.resolve(projectRoot, '../../shots');

function findChromiumExecutable(): string {
  const candidates = [
    process.env.CHROME_PATH,
    '/Users/eligo/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Users/eligo/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Users/eligo/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('Could not locate local Chromium binary for Playwright E2E verification.');
}

async function waitForHealth(baseUrl: string, timeoutMs = 12000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // Wait for startup.
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server at ${baseUrl} did not become healthy within ${timeoutMs}ms.`);
}

async function main(): Promise<void> {
  fs.mkdirSync(materialsDir, { recursive: true });
  fs.mkdirSync(shotsDir, { recursive: true });

  const port = 4289;
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempDataFile = path.join(os.tmpdir(), `karmaforge-e2e-${Date.now()}.json`);
  const tsxBin = path.join(projectRoot, 'node_modules/.bin/tsx');

  const serverProc = spawn(tsxBin, ['src/server/server-local.ts'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      KARMAFORGE_DATA_FILE: tempDataFile,
      KARMAFORGE_USER: 'Mindless-Past7833',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const serverLogs: string[] = [];
  serverProc.stdout?.on('data', (chunk: Buffer) => serverLogs.push(chunk.toString()));
  serverProc.stderr?.on('data', (chunk: Buffer) => serverLogs.push(chunk.toString()));

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  try {
    await waitForHealth(baseUrl);

    const executablePath = findChromiumExecutable();
    const browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--use-mock-keychain', '--password-store=basic'],
    });

    try {
      // ========================================================
      // 1. DESKTOP EMBEDDED REDDIT POST VIEWPORT (760 x 620)
      // ========================================================
      const desktopContext = await browser.newContext({
        viewport: { width: 760, height: 620 },
        deviceScaleFactor: 2,
      });
      const page = await desktopContext.newPage();

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', (err) => {
        pageErrors.push(err.message);
      });
      page.on('response', (res) => {
        if (res.status() >= 400) {
          failedRequests.push(`${res.status()} ${res.url()}`);
        }
      });

      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.getByTestId('karmaforge-app').waitFor({ state: 'visible' });

      // Verify obsidian dark background (#101010 -> rgb(16, 16, 16))
      const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      if (bgColor !== 'rgb(16, 16, 16)') {
        throw new Error(`Expected dark terminal body bg rgb(16, 16, 16), got ${bgColor}`);
      }

      // Verify all 3 generated pixel badges loaded & decoded cleanly in the DOM!
      const loadedBadges = await page.evaluate(async () => {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.kf-badge-img'));
        await Promise.all(
          imgs.map((img) =>
            img.decode ? img.decode().catch(() => undefined) : Promise.resolve(),
          ),
        );
        return imgs.map((img) => ({
          src: img.getAttribute('src'),
          complete: img.complete,
          naturalWidth: img.naturalWidth,
        }));
      });
      if (loadedBadges.length < 3 || loadedBadges.some((b) => !b.complete || b.naturalWidth <= 0)) {
        throw new Error(`Pixel badges failed to load: ${JSON.stringify(loadedBadges)}`);
      }

      // Assert zero horizontal overflow at 760px Reddit embedded post width.
      const desktopOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (desktopOverflow.scrollWidth > desktopOverflow.clientWidth) {
        throw new Error(
          `Desktop horizontal overflow: scrollWidth=${desktopOverflow.scrollWidth} > clientWidth=${desktopOverflow.clientWidth}`,
        );
      }

      // Verify 3-second zero-friction micro-guidance appears on fresh load!
      await page.getByTestId('micro-guide-cue').waitFor({ state: 'visible' });
      const guidedCount = await page.locator('[data-guided="true"]').count();
      if (guidedCount !== 1) {
        throw new Error(`Expected 1 warm-gold guided bridge card on first visit, found ${guidedCount}`);
      }

      // Screenshot 1: Clean Dark Terminal Daily Board (760x620) with Micro-Guide & Iron Forge Toggle
      await page.screenshot({
        path: path.join(materialsDir, '01_daily_board.png'),
        fullPage: true,
      });
      await page.screenshot({
        path: path.join(shotsDir, 'after_daily_board.png'),
        fullPage: true,
      });

      // Test Keyboard Speedflow: press 'h' to reveal Top Comment Clue #1, press '1' -> micro-guide vanishes & persists!
      await page.keyboard.press('h');
      await page.getByTestId('hint-card-0').waitFor({ state: 'visible' });

      await page.keyboard.press('1');
      await page.waitForTimeout(80);
      const guideAfterFirstKey = await page.getByTestId('micro-guide-cue').count();
      if (guideAfterFirstKey !== 0) {
        throw new Error('Expected 3-second micro-guidance to disappear immediately after key 1');
      }
      await page.keyboard.press('z');
      await page.waitForTimeout(80);
      const guideAfterUndo = await page.getByTestId('micro-guide-cue').count();
      const persistedDismiss = await page.evaluate(() =>
        window.localStorage.getItem('karmaforge:micro_guide_dismissed:v1'),
      );
      if (guideAfterUndo !== 0 || persistedDismiss !== '1') {
        throw new Error(
          `Expected micro-guide dismissal to persist (count=${guideAfterUndo}, storage=${persistedDismiss})`,
        );
      }

      // Toggle Iron Forge (Hard Mode) ON before Attempt 1 -> 3 attempts max + strict clues
      await page.getByTestId('iron-forge-toggle').click();
      await page.waitForTimeout(80);
      const attemptsLabelText = await page.getByTestId('attempts-label').textContent();
      if (!attemptsLabelText?.includes('Iron Forge 0/3')) {
        throw new Error(`Expected Iron Forge 0/3 label after toggle, got "${attemptsLabelText}"`);
      }

      // Regression check: keyboard shortcuts (1 + z) still work immediately while Iron Forge switch holds focus!
      await page.keyboard.press('1');
      await page.waitForTimeout(60);
      const forgeTextAfterFocusedKey = await page.getByTestId('forge-submit-btn').textContent();
      if (!forgeTextAfterFocusedKey?.includes('(1/4)')) {
        throw new Error(
          `Expected key '1' to place card while Iron Forge checkbox focused; got "${forgeTextAfterFocusedKey}"`,
        );
      }
      await page.keyboard.press('z');
      await page.waitForTimeout(60);

      // Compute exact card IDs for today's UTC puzzle to execute both a partial guess AND winning solve.
      const todayUtc = getUtcDateKey();
      const { puzzle } = getPuzzleForDate(todayUtc);
      const [s0, s1, s2, s3] = puzzle.solutionIds;
      const redHerring = puzzle.cards.find((c) => c.isRedHerring)!;

      // Place Attempt 1: [Exact, Misplaced, Red Herring, Exact]
      await page.getByTestId(`bridge-card-${s0}`).click();
      await page.getByTestId(`bridge-card-${s2}`).click();
      await page.getByTestId(`bridge-card-${redHerring.id}`).click();
      await page.getByTestId(`bridge-card-${s3}`).click();

      // Submit via Enter keyboard speedflow!
      await page.locator('body').click({ position: { x: 10, y: 10 } });
      await page.keyboard.press('Enter');
      await page.getByTestId('feedback-banner').waitFor({ state: 'visible' });
      await page.waitForTimeout(480);

      // Verify exact / misplaced / wrong verdicts on the 4 slots & Iron Forge lock + banned red herring!
      const verdicts = await Promise.all(
        [0, 1, 2, 3].map((i) => page.getByTestId(`thread-slot-${i}`).getAttribute('data-verdict')),
      );
      if (verdicts.join(',') !== 'exact,misplaced,wrong,exact') {
        throw new Error(`Expected verdicts exact,misplaced,wrong,exact; got ${verdicts.join(',')}`);
      }
      const ironLockedAfterA1 = await page.getByTestId('iron-forge-checkbox').isDisabled();
      if (!ironLockedAfterA1) {
        throw new Error('Expected Iron Forge toggle to be locked after Attempt 1');
      }

      // Screenshot 2: Midgame Graded Feedback (Emerald + Amber + Charcoal + Iron Forge + Top Comment Clue)
      await page.screenshot({
        path: path.join(materialsDir, '02_midgame_feedback.png'),
        fullPage: true,
      });

      // Clear unlocked slots (keeps Slot 0 & Slot 3 locked as Exact Emerald!)
      await page.getByTestId('clear-unlocked-btn').click();
      // Once cleared from Slot 3, the exposed Red Herring must be disabled/banned in Iron Forge!
      const redHerringDisabled = await page.getByTestId(`bridge-card-${redHerring.id}`).isDisabled();
      if (!redHerringDisabled) {
        throw new Error('Expected eliminated Red Herring card to be disabled in Iron Forge after clearing');
      }
      await page.getByTestId(`bridge-card-${s1}`).click();
      await page.getByTestId(`bridge-card-${s2}`).click();

      // Forge the winning 4-link thread in Iron Forge mode!
      await page.getByTestId('forge-submit-btn').click();
      await page.getByTestId('share-markdown-preview').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(280);

      // Verify Iron Forge victory badge & Global Crowd Consensus % histogram!
      await page.getByTestId('iron-forge-badge').waitFor({ state: 'visible' });
      await page.getByTestId('crowd-consensus-panel').waitFor({ state: 'visible' });
      const consensusHeadline = await page.getByTestId('consensus-percentile-pill').textContent();
      if (!consensusHeadline?.includes('Sharper than') || !consensusHeadline.includes('r/KarmaForge')) {
        throw new Error(`Unexpected Crowd Consensus headline: "${consensusHeadline}"`);
      }
      const playerBucketAttr = await page
        .getByTestId('consensus-bucket-2')
        .getAttribute('data-player');
      if (playerBucketAttr !== 'true') {
        throw new Error('Expected consensus bucket 2 to be highlighted as player bucket');
      }

      // Click 1-Click Post Spoiler-Free Comment
      await page.getByTestId('post-share-comment-btn').click();
      await page.getByTestId('share-status-notice').waitFor({ state: 'visible' });

      // Scroll modal back to top so score grid, Crowd Consensus, and share card all appear cleanly in screenshot 3
      await page.evaluate(() => {
        const openDialog = document.querySelector('dialog[open]');
        if (openDialog) openDialog.scrollTop = 0;
      });
      await page.waitForTimeout(100);

      const shareMd = await page.getByTestId('share-markdown-preview').textContent();
      if (
        !shareMd ||
        !shareMd.includes('⚒️ IRON FORGE') ||
        !shareMd.includes('2/3 moves') ||
        !shareMd.includes('Sharper than') ||
        !shareMd.includes('🟩🟨⬛🟩') ||
        !shareMd.includes('🟩🟩🟩🟩') ||
        !shareMd.includes('Karma')
      ) {
        throw new Error(`Unexpected spoiler-free Iron Forge share markdown: ${shareMd}`);
      }

      // Verify streak updated to 1d Lurker
      const streakText = await page.getByTestId('streak-pill').textContent();
      if (!streakText?.includes('1d') || !streakText.includes('Lurker')) {
        throw new Error(`Expected streak pill with 1d Lurker; got "${streakText}"`);
      }

      // Screenshot 3: Victory Modal & Iron Forge + Crowd Consensus + Spoiler-Free Share Card
      await page.screenshot({
        path: path.join(materialsDir, '03_victory_share_card.png'),
        fullPage: false,
      });
      await page.screenshot({
        path: path.join(shotsDir, 'after_victory_share_card.png'),
        fullPage: false,
      });

      // Verify Leaderboard shows our real Iron Forge solve + live spoiler-free thread comment
      await page.getByRole('button', { name: 'Leaderboard' }).click();
      await page.getByTestId('leaderboard-table').waitFor({ state: 'visible' });
      const lbText = await page.getByTestId('leaderboard-table').textContent();
      if (!lbText?.includes('u/Mindless-Past7833') || !lbText.includes('2/3') || !lbText.includes('Iron')) {
        throw new Error(`Leaderboard missing Iron Forge player entry: ${lbText}`);
      }
      await page.getByTestId('shared-comments-feed').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');

      // ========================================================
      // 2. COMMUNITY FORGE TAB (760 x 620) -> 05_community_forge.png
      // ========================================================
      await page.getByTestId('tab-community').click();
      await page.getByTestId('community-forge-view').waitFor({ state: 'visible' });
      await page.getByTestId('community-nominee-list').waitFor({ state: 'visible' });

      // Cast a real upvote on the #1 frontrunner
      const firstVoteBtn = page.locator('[data-testid^="community-vote-"]').first();
      const beforeVotes = Number((await firstVoteBtn.textContent())?.trim() ?? '0');
      await firstVoteBtn.click();
      await page.waitForTimeout(250);
      const afterVotes = Number((await firstVoteBtn.textContent())?.trim() ?? '0');
      if (afterVotes !== beforeVotes + 1) {
        throw new Error(`Expected community vote increment ${beforeVotes} -> ${beforeVotes + 1}, got ${afterVotes}`);
      }

      // Load a sample blueprint and publish a real user puzzle into tomorrow's queue
      await page.getByTestId('load-sample-forge-btn').click();
      await page.waitForTimeout(100);
      await page.getByTestId('community-submit-btn').click();
      await page.getByTestId('community-status-banner').waitFor({ state: 'visible' });
      await page.waitForTimeout(250);

      const nomineeCount = await page.locator('[data-testid^="community-item-"]').count();
      if (nomineeCount < 4) {
        throw new Error(`Expected >= 4 community nominees after submission, found ${nomineeCount}`);
      }

      // Reload the blueprint into the composer preview so the screenshot showcases both live queue + filled form
      await page.getByTestId('load-sample-forge-btn').click();
      await page.waitForTimeout(150);

      const cfOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (cfOverflow.scrollWidth > cfOverflow.clientWidth) {
        throw new Error(
          `Community Forge overflow: scrollWidth=${cfOverflow.scrollWidth} > clientWidth=${cfOverflow.clientWidth}`,
        );
      }

      // Screenshot 5: Community Forge UGC Workshop & Tomorrow's Vote Queue
      await page.screenshot({
        path: path.join(materialsDir, '05_community_forge.png'),
        fullPage: true,
      });

      // ========================================================
      // 2B. V5 PLAYABLE UGC PLAYGROUND -> PLAY THREAD -> SOLVE -> RANKS
      // ========================================================
      const seedId = 'cf-seed-mechanical-keyboards';
      await page.getByTestId(`community-play-${seedId}`).click();
      await page.getByTestId('community-play-badge').waitFor({ state: 'visible' });
      await page.getByTestId('back-to-daily-btn').waitFor({ state: 'visible' });

      // Reveal creator's Top Comment Clue with 'h'
      await page.keyboard.press('h');
      await page.getByTestId('hint-card-0').waitFor({ state: 'visible' });

      // Attempt 1 on UGC thread: [l1, l3, t1, l4] -> Exact Lock + Spark feedback!
      await page.getByTestId(`bridge-card-${seedId}-l1`).click();
      await page.getByTestId(`bridge-card-${seedId}-l3`).click();
      await page.getByTestId(`bridge-card-${seedId}-t1`).click();
      await page.getByTestId(`bridge-card-${seedId}-l4`).click();
      await page.getByTestId('forge-submit-btn').click();
      await page.getByTestId('feedback-banner').waitFor({ state: 'visible' });
      await page.waitForTimeout(300);

      // Capture V5 Screenshot: Playable UGC Thread Live Board
      await page.screenshot({
        path: path.join(shotsDir, 'after_v5_community_play.png'),
        fullPage: true,
      });

      // Clear unlocked and solve the UGC thread on Attempt 2!
      await page.getByTestId('clear-unlocked-btn').click();
      await page.getByTestId(`bridge-card-${seedId}-l2`).click();
      await page.getByTestId(`bridge-card-${seedId}-l3`).click();
      await page.getByTestId('forge-submit-btn').click();
      await page.getByTestId('creator-karma-award').waitFor({ state: 'visible', timeout: 5000 });

      const ugcShareMd = await page.getByTestId('share-markdown-preview').textContent();
      if (!ugcShareMd?.includes('KarmaForge Community') || !ugcShareMd.includes('u/ThockArchitect')) {
        throw new Error(`Expected UGC share markdown with creator credit, got: ${ugcShareMd}`);
      }

      // Click Back to Daily inside modal -> verify today's Daily Forge state is completely intact!
      await page.getByTestId('modal-back-to-daily-btn').click();
      await page.waitForTimeout(250);
      const dailyAttemptsAfterUgc = await page.getByTestId('attempts-label').textContent();
      if (!dailyAttemptsAfterUgc?.includes('Forged 2/3')) {
        throw new Error(
          `Expected today's Daily Forge (Forged 2/3) intact after UGC return, got "${dailyAttemptsAfterUgc}"`,
        );
      }

      // Verify Community Forge nominee card updated to 1 play · 1 clear (100%)!
      await page.getByTestId('tab-community').click();
      await page.getByTestId(`community-stats-${seedId}`).waitFor({ state: 'visible' });
      const ugcStatsText = await page.getByTestId(`community-stats-${seedId}`).textContent();
      if (!ugcStatsText?.includes('1 play') || !ugcStatsText.includes('1 clear')) {
        throw new Error(`Expected live UGC play/clear stats, got "${ugcStatsText}"`);
      }

      // Open upgraded 3-tab Ranks modal -> Daily Speedrun, Iron Forge Hall, Top Forgers!
      await page.getByTestId('open-leaderboard-btn').click();
      await page.getByTestId('leaderboard-self-row').waitFor({ state: 'visible' });
      await page.getByTestId('ranks-tab-iron').click();
      await page.getByTestId('iron-leaderboard-table').waitFor({ state: 'visible' });
      await page.getByTestId('ranks-tab-forgers').click();
      await page.getByTestId('top-forgers-table').waitFor({ state: 'visible' });
      await page.getByTestId('top-forgers-self-row').waitFor({ state: 'visible' });
      const forgersText = await page.getByTestId('top-forgers-table').textContent();
      if (!forgersText?.includes('u/ThockArchitect') || !forgersText.includes('u/Mindless-Past7833')) {
        throw new Error(`Top Forgers missing expected creators: ${forgersText}`);
      }
      await page.waitForTimeout(120);

      // Capture V5 Screenshot: Upgraded 3-tab Ranks & Top Forgers Modal
      await page.screenshot({
        path: path.join(shotsDir, 'after_v5_ranks.png'),
        fullPage: false,
      });
      await page.keyboard.press('Escape');

      // Verify sound toggle triggers cleanly without Web Audio autoplay console errors
      await page.getByTestId('toggle-sound-btn').click();
      await page.getByTestId('toggle-sound-btn').click();

      // Return to Daily tab & verify Archive Browser shows 60-day Streak Heatmap + all 60 editions
      await page.getByTestId('tab-daily').click();
      await page.getByTestId('open-archive-btn').click();
      await page.getByTestId('archive-heatmap').waitFor({ state: 'visible' });
      const heatmapCount = await page.locator('[data-testid="archive-heatmap"] button').count();
      if (heatmapCount !== 60) {
        throw new Error(`Expected 60 heatmap cells, found ${heatmapCount}`);
      }
      const wonHeatmapCells = await page
        .locator('[data-testid="archive-heatmap"] button[data-status="won"]')
        .count();
      if (wonHeatmapCells < 1) {
        throw new Error(`Expected >= 1 solved heatmap cell, found ${wonHeatmapCells}`);
      }
      await page.getByTestId('archive-edition-list').waitFor({ state: 'visible' });
      const archiveCount = await page.locator('[data-testid="archive-edition-list"] button').count();
      if (archiveCount !== 60) {
        throw new Error(`Expected 60 archive editions, found ${archiveCount}`);
      }
      await page.locator('[data-testid="archive-edition-list"] button').nth(1).click();
      await page.waitForTimeout(300);

      await desktopContext.close();

      // ========================================================
      // 3. MOBILE VIEWPORT (375 x 667) -> 04_mobile_375px.png
      // ========================================================
      const mobileContext = await browser.newContext({
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
      });
      const mobilePage = await mobileContext.newPage();

      mobilePage.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(`[mobile] ${msg.text()}`);
        }
      });
      mobilePage.on('pageerror', (err) => {
        pageErrors.push(`[mobile] ${err.message}`);
      });
      mobilePage.on('response', (res) => {
        if (res.status() >= 400) {
          failedRequests.push(`[mobile] ${res.status()} ${res.url()}`);
        }
      });

      await mobilePage.goto(baseUrl, { waitUntil: 'networkidle' });
      await mobilePage.getByTestId('open-archive-btn').click();
      await mobilePage.getByTestId('archive-edition-list').waitFor({ state: 'visible' });
      await mobilePage.locator('[data-testid="archive-edition-list"] button').nth(2).click();
      await mobilePage.waitForTimeout(300);

      const mobileOverflow = await mobilePage.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (mobileOverflow.scrollWidth > mobileOverflow.clientWidth) {
        throw new Error(
          `Mobile horizontal overflow: scrollWidth=${mobileOverflow.scrollWidth} > clientWidth=${mobileOverflow.clientWidth}`,
        );
      }

      // Verify 375x667 first-fold ergonomics: Opening Post + Slot #1 + Slot #2 visible above sticky bar!
      const mobileFoldCheck = await mobilePage.evaluate(() => {
        const slot1 = document.querySelector('[data-testid="thread-slot-0"]')?.getBoundingClientRect();
        const slot2 = document.querySelector('[data-testid="thread-slot-1"]')?.getBoundingClientRect();
        const bar = document.querySelector('.kf-action-bar')?.getBoundingClientRect();
        return {
          slot1Bottom: slot1?.bottom ?? 9999,
          slot2Top: slot2?.top ?? 9999,
          barTop: bar?.top ?? 667,
        };
      });
      if (mobileFoldCheck.slot1Bottom > mobileFoldCheck.barTop || mobileFoldCheck.slot2Top >= mobileFoldCheck.barTop) {
        throw new Error(
          `375px first-fold regression: expected Slot #1 & Slot #2 visible above sticky bar (${JSON.stringify(mobileFoldCheck)})`,
        );
      }

      // Screenshot 4: Mobile 375px dark terminal layout
      await mobilePage.screenshot({
        path: path.join(materialsDir, '04_mobile_375px.png'),
        fullPage: false,
      });
      await mobilePage.screenshot({
        path: path.join(shotsDir, 'after_mobile_375px.png'),
        fullPage: false,
      });
      await mobilePage.screenshot({
        path: path.join(shotsDir, 'after_v5_mobile_375px.png'),
        fullPage: false,
      });

      await mobileContext.close();
    } finally {
      await browser.close();
    }

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Uncaught page errors detected:\n${pageErrors.join('\n')}`);
    }
    if (failedRequests.length > 0) {
      throw new Error(`Failed HTTP requests detected:\n${failedRequests.join('\n')}`);
    }

    console.log('✅ KarmaForge V2 Playwright E2E PASS — 0 console/page/network errors!');
    console.log('   Saved 5 Dark Terminal Geek screenshots:');
    console.log(`   - ${path.join(materialsDir, '01_daily_board.png')}`);
    console.log(`   - ${path.join(materialsDir, '02_midgame_feedback.png')}`);
    console.log(`   - ${path.join(materialsDir, '03_victory_share_card.png')}`);
    console.log(`   - ${path.join(materialsDir, '04_mobile_375px.png')}`);
    console.log(`   - ${path.join(materialsDir, '05_community_forge.png')}`);
  } catch (err) {
    console.error('❌ E2E failed:', err);
    if (serverLogs.length > 0) {
      console.error('Server logs:\n', serverLogs.join(''));
    }
    process.exitCode = 1;
  } finally {
    serverProc.kill('SIGTERM');
    fs.rmSync(tempDataFile, { force: true });
  }
}

await main();
