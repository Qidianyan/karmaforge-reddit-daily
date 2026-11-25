import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';

export interface KvStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<void>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  zAdd(key: string, member: string, score: number): Promise<void>;
  zRange(key: string, start: number, stop: number): Promise<Array<{ member: string; score: number }>>;
  zCard(key: string): Promise<number>;
}

export interface RequestActor {
  userId: string;
  username: string;
  subredditName: string;
  postId: string | null;
}

export interface RuntimeBridge {
  runtimeMode: 'devvit' | 'local';
  getRequestActor(req: Request): Promise<RequestActor>;
  submitSpoilerFreeComment(params: {
    postId: string | null;
    text: string;
    username: string;
  }): Promise<{
    postedTo: 'reddit' | 'local' | 'clipboard-only';
    commentId: string | null;
    message: string;
  }>;
  createDailyPost?(params: {
    subredditName: string;
    title: string;
  }): Promise<{ postId: string; url: string }>;
}

interface LocalStoreSnapshot {
  strings: Record<string, string>;
  hashes: Record<string, Record<string, string>>;
  zsets: Record<string, Record<string, number>>;
}

function emptySnapshot(): LocalStoreSnapshot {
  return { strings: {}, hashes: {}, zsets: {} };
}

/**
 * Genuine file-backed Redis-compatible KV store for standalone local mode & automated testing.
 * Stores real player sessions, streaks, leaderboards, and posted comments on disk with zero fake data.
 */
export class FileBackedKvStore implements KvStore {
  private readonly filePath: string | null;
  private data: LocalStoreSnapshot;

  constructor(filePath: string | null = null) {
    this.filePath = filePath;
    this.data = this.loadFromDisk();
  }

  private loadFromDisk(): LocalStoreSnapshot {
    if (!this.filePath) {
      return emptySnapshot();
    }
    try {
      if (!fs.existsSync(this.filePath)) {
        return emptySnapshot();
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<LocalStoreSnapshot>;
      return {
        strings: parsed.strings ?? {},
        hashes: parsed.hashes ?? {},
        zsets: parsed.zsets ?? {},
      };
    } catch {
      return emptySnapshot();
    }
  }

  private flushToDisk(): void {
    if (!this.filePath) {
      return;
    }
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }

  async get(key: string): Promise<string | undefined> {
    return this.data.strings[key];
  }

  async set(key: string, value: string): Promise<void> {
    this.data.strings[key] = value;
    this.flushToDisk();
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    return { ...(this.data.hashes[key] ?? {}) };
  }

  async hSet(key: string, fieldValues: Record<string, string>): Promise<void> {
    const existing = this.data.hashes[key] ?? {};
    this.data.hashes[key] = { ...existing, ...fieldValues };
    this.flushToDisk();
  }

  async hIncrBy(key: string, field: string, value: number): Promise<number> {
    const existing = this.data.hashes[key] ?? {};
    const current = Number.parseInt(existing[field] ?? '0', 10) || 0;
    const next = current + value;
    existing[field] = String(next);
    this.data.hashes[key] = existing;
    this.flushToDisk();
    return next;
  }

  async zAdd(key: string, member: string, score: number): Promise<void> {
    const zset = this.data.zsets[key] ?? {};
    zset[member] = score;
    this.data.zsets[key] = zset;
    this.flushToDisk();
  }

  async zRange(
    key: string,
    start: number,
    stop: number,
  ): Promise<Array<{ member: string; score: number }>> {
    const zset = this.data.zsets[key] ?? {};
    const sorted = Object.entries(zset)
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));

    if (sorted.length === 0) {
      return [];
    }
    const resolvedStop = stop < 0 ? sorted.length + stop : stop;
    return sorted.slice(Math.max(0, start), resolvedStop + 1);
  }

  async zCard(key: string): Promise<number> {
    return Object.keys(this.data.zsets[key] ?? {}).length;
  }
}
