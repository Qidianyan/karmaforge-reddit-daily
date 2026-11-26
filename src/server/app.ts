import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Express, Request, Response } from 'express';
import { getPuzzleForDate, getUtcDateKey, padIssueNumber } from '../shared/index.js';
import type {
  CommunityForgeDraftInput,
  CommunityVoteRequestBody,
  GuessRequestBody,
  HintRequestBody,
  ShareCommentRequestBody,
} from '../shared/index.js';
import {
  buildArchiveList,
  buildCommunityPlayState,
  buildGameState,
  createCommunityPuzzle,
  filterIronForgeLeaderboard,
  handleCommunityGuess,
  handleCommunityHint,
  handleCommunityShare,
  handleGuessSubmission,
  handleHintUnlock,
  handleShareComment,
  listCommunityPuzzles,
  readDailyLeaderboard,
  readDailyStats,
  readRecentShares,
  readTopForgers,
  resolveDateKey,
  toggleCommunityVote,
} from './service.js';
import type { KvStore, RuntimeBridge } from './storage.js';

export interface AppDependencies {
  store: KvStore;
  bridge: RuntimeBridge;
  staticClientDir?: string;
}

function sendError(res: Response, err: unknown, statusCode = 400): void {
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  res.status(statusCode).json({ error: message });
}

export function createKarmaForgeApp(deps: AppDependencies): Express {
  const { store, bridge, staticClientDir } = deps;
  const app = express();

  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      app: 'karmaforge-daily',
      runtimeMode: bridge.runtimeMode,
      todayUtc: getUtcDateKey(),
    });
  });

  app.get('/api/state', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
      const state = await buildGameState(store, bridge, actor, dateParam);
      res.json(state);
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  app.post('/api/guess', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const body = (req.body ?? {}) as GuessRequestBody;
      const state = await handleGuessSubmission(store, bridge, actor, body);
      res.json(state);
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  app.post('/api/hint', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const body = (req.body ?? {}) as HintRequestBody;
      const state = await handleHintUnlock(store, bridge, actor, body);
      res.json(state);
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  app.post('/api/share-comment', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const body = (req.body ?? {}) as ShareCommentRequestBody;
      const result = await handleShareComment(store, bridge, actor, body);
      res.json(result);
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  app.get('/api/archive', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const archive = await buildArchiveList(store, actor);
      res.json(archive);
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  app.get('/api/leaderboard', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const todayUtc = getUtcDateKey();
      const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
      const dateKey = resolveDateKey(dateParam, todayUtc);
      const [stats, fullLeaderboard, recentShares, topForgers] = await Promise.all([
        readDailyStats(store, dateKey),
        readDailyLeaderboard(store, dateKey, 50),
        readRecentShares(store, dateKey),
        readTopForgers(store, actor),
      ]);
      res.json({
        dateKey,
        stats,
        leaderboard: fullLeaderboard.slice(0, 15),
        ironForgeLeaderboard: filterIronForgeLeaderboard(fullLeaderboard, 15),
        topForgers,
        recentShares,
      });
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  app.get('/api/community/puzzles', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const queue = await listCommunityPuzzles(store, actor);
      res.json(queue);
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  app.post('/api/community/puzzles', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const draft = (req.body ?? {}) as CommunityForgeDraftInput;
      const created = await createCommunityPuzzle(store, actor, draft);
      res.status(201).json(created);
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  app.post('/api/community/vote', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const body = (req.body ?? {}) as CommunityVoteRequestBody;
      const voted = await toggleCommunityVote(store, actor, body);
      res.json(voted);
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  app.get('/api/community/play/:puzzleId', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const puzzleId = String(req.params.puzzleId ?? '');
      const state = await buildCommunityPlayState(store, bridge, actor, puzzleId);
      res.json(state);
    } catch (err) {
      sendError(res, err, 404);
    }
  });

  app.post('/api/community/play/:puzzleId/guess', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const puzzleId = String(req.params.puzzleId ?? '');
      const body = (req.body ?? {}) as GuessRequestBody;
      const state = await handleCommunityGuess(store, bridge, actor, puzzleId, body);
      res.json(state);
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  app.post('/api/community/play/:puzzleId/hint', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const puzzleId = String(req.params.puzzleId ?? '');
      const state = await handleCommunityHint(store, bridge, actor, puzzleId);
      res.json(state);
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  app.post('/api/community/play/:puzzleId/share', async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const puzzleId = String(req.params.puzzleId ?? '');
      const result = await handleCommunityShare(store, bridge, actor, puzzleId);
      res.json(result);
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  // Devvit internal lifecycle triggers (app install, mod menu, daily UTC midnight scheduler).
  const handleCreateDailyPost = async (req: Request, res: Response) => {
    try {
      const actor = await bridge.getRequestActor(req);
      const todayUtc = getUtcDateKey();
      const { puzzle, issueNumber } = getPuzzleForDate(todayUtc);
      const title = `KarmaForge #${padIssueNumber(issueNumber)} · ${puzzle.title} (${todayUtc})`;

      if (bridge.createDailyPost) {
        const created = await bridge.createDailyPost({
          subredditName: actor.subredditName,
          title,
        });
        res.json({
          navigateTo: created.url,
          showToast: `Published ${title}`,
          postId: created.postId,
        });
        return;
      }

      res.json({
        ok: true,
        title,
        message: 'Daily post handler ready (connect Devvit runtime to publish directly to Reddit).',
      });
    } catch (err) {
      sendError(res, err, 500);
    }
  };

  app.post('/internal/on-app-install', handleCreateDailyPost);
  app.post('/internal/menu/post-create', handleCreateDailyPost);
  app.post('/internal/cron/daily-post', handleCreateDailyPost);

  if (staticClientDir && fs.existsSync(staticClientDir)) {
    app.use(express.static(staticClientDir));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/internal/')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.sendFile(path.join(staticClientDir, 'index.html'));
    });
  }

  return app;
}
