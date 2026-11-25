import { context, createServer, getServerPort, reddit, redis } from '@devvit/web/server';
import type { Request } from 'express';
import { createKarmaForgeApp } from './app.js';
import type { KvStore, RequestActor, RuntimeBridge } from './storage.js';

/**
 * Production Devvit Redis adapter backed directly by `@devvit/web/server`'s `redis` client.
 */
const devvitRedisStore: KvStore = {
  async get(key) {
    return redis.get(key);
  },
  async set(key, value) {
    await redis.set(key, value);
  },
  async hGetAll(key) {
    return redis.hGetAll(key);
  },
  async hSet(key, fieldValues) {
    await redis.hSet(key, fieldValues);
  },
  async hIncrBy(key, field, value) {
    return redis.hIncrBy(key, field, value);
  },
  async zAdd(key, member, score) {
    await redis.zAdd(key, { member, score });
  },
  async zRange(key, start, stop) {
    return redis.zRange(key, start, stop, { by: 'rank' });
  },
  async zCard(key) {
    return redis.zCard(key);
  },
};

const devvitBridge: RuntimeBridge = {
  runtimeMode: 'devvit',
  async getRequestActor(_req: Request): Promise<RequestActor> {
    const rawUserId = context.userId ?? 't2_anonymous';
    const usernameFromApi = await reddit.getCurrentUsername().catch(() => undefined);
    const username = usernameFromApi ? `u/${usernameFromApi}` : 'u/Redditor';
    return {
      userId: rawUserId,
      username,
      subredditName: context.subredditName ?? 'r/KarmaForgeDaily',
      postId: context.postId ?? null,
    };
  },
  async submitSpoilerFreeComment({ postId, text }) {
    if (!postId || !postId.startsWith('t3_')) {
      return {
        postedTo: 'clipboard-only',
        commentId: null,
        message: 'Copied your spoiler-free grid — paste it into the daily post thread!',
      };
    }

    const comment = await reddit.submitComment({
      id: postId as `t3_${string}`,
      text,
      runAs: 'USER',
    });

    return {
      postedTo: 'reddit',
      commentId: comment.id,
      message: 'Posted your spoiler-free KarmaForge grid straight to this thread!',
    };
  },
  async createDailyPost({ subredditName, title }) {
    const cleanSub = subredditName.replace(/^r\//, '');
    const post = await reddit.submitCustomPost({
      subredditName: cleanSub,
      title,
    });
    return {
      postId: post.id,
      url: `https://reddit.com/r/${cleanSub}/comments/${post.id.replace(/^t3_/, '')}`,
    };
  },
};

const app = createKarmaForgeApp({
  store: devvitRedisStore,
  bridge: devvitBridge,
});

const server = createServer(app);
const port = getServerPort();

server.on('error', (err) => {
  console.error('[KarmaForge Devvit Server] Error:', err);
});

server.listen(port, () => {
  console.log(`[KarmaForge Devvit Server] Listening on port ${port}`);
});
