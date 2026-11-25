import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request } from 'express';
import { createKarmaForgeApp } from './app.js';
import { FileBackedKvStore } from './storage.js';
import type { RequestActor, RuntimeBridge } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const port = Number.parseInt(process.env.PORT ?? '4173', 10) || 4173;
const dataFile =
  process.env.KARMAFORGE_DATA_FILE ?? path.resolve(projectRoot, 'data/local-store.json');
const staticClientDir = path.resolve(projectRoot, 'dist/client');

const store = new FileBackedKvStore(dataFile);

function sanitizeHandle(raw: string): string {
  const cleaned = raw.replace(/^u\//i, '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  return cleaned.length > 0 ? cleaned : 'Mindless-Past7833';
}

const localBridge: RuntimeBridge = {
  runtimeMode: 'local',
  async getRequestActor(req: Request): Promise<RequestActor> {
    const headerUser = req.header('x-karmaforge-user');
    const handle = sanitizeHandle(headerUser ?? process.env.KARMAFORGE_USER ?? 'Mindless-Past7833');
    return {
      userId: `local_${handle.toLowerCase()}`,
      username: `u/${handle}`,
      subredditName: 'r/KarmaForgeDaily',
      postId: 't3_local_daily',
    };
  },
  async submitSpoilerFreeComment({ username }) {
    const commentId = `t1_local_${Date.now().toString(36)}`;
    return {
      postedTo: 'local',
      commentId,
      message: `Posted spoiler-free grid as ${username} to the local subreddit thread & copied to clipboard!`,
    };
  },
};

const app = createKarmaForgeApp({
  store,
  bridge: localBridge,
  staticClientDir,
});

app.listen(port, '127.0.0.1', () => {
  console.log(`[KarmaForge Local Server] http://127.0.0.1:${port}`);
  console.log(`[KarmaForge Local Store]  ${dataFile}`);
});
