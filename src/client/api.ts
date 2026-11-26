import type {
  ArchiveResponse,
  CommunityForgeCreateResponse,
  CommunityForgeDraftInput,
  CommunityForgeListResponse,
  CommunityVoteResponse,
  DailyCommunityStats,
  GameStateResponse,
  LeaderboardEntry,
  ShareCommentResponse,
  SharedCommentItem,
} from '../shared/index.js';

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export async function fetchGameState(dateKey?: string): Promise<GameStateResponse> {
  const query = dateKey ? `?date=${encodeURIComponent(dateKey)}` : '';
  const res = await fetch(`/api/state${query}`, { cache: 'no-store' });
  return parseJsonOrThrow<GameStateResponse>(res);
}

export async function postGuess(params: {
  dateKey: string;
  cardIds: string[];
  elapsedSeconds: number;
  hardMode?: boolean;
}): Promise<GameStateResponse> {
  const res = await fetch('/api/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow<GameStateResponse>(res);
}

export async function postHint(dateKey: string): Promise<GameStateResponse> {
  const res = await fetch('/api/hint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateKey }),
  });
  return parseJsonOrThrow<GameStateResponse>(res);
}

export async function postShareComment(dateKey: string): Promise<ShareCommentResponse> {
  const res = await fetch('/api/share-comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateKey }),
  });
  return parseJsonOrThrow<ShareCommentResponse>(res);
}

export async function fetchArchive(): Promise<ArchiveResponse> {
  const res = await fetch('/api/archive', { cache: 'no-store' });
  return parseJsonOrThrow<ArchiveResponse>(res);
}

export async function fetchLeaderboard(dateKey: string): Promise<{
  dateKey: string;
  stats: DailyCommunityStats;
  leaderboard: LeaderboardEntry[];
  recentShares: SharedCommentItem[];
}> {
  const res = await fetch(`/api/leaderboard?date=${encodeURIComponent(dateKey)}`, {
    cache: 'no-store',
  });
  return parseJsonOrThrow(res);
}

export async function fetchCommunityPuzzles(): Promise<CommunityForgeListResponse> {
  const res = await fetch('/api/community/puzzles', { cache: 'no-store' });
  return parseJsonOrThrow<CommunityForgeListResponse>(res);
}

export async function postCommunityPuzzle(
  draft: CommunityForgeDraftInput,
): Promise<CommunityForgeCreateResponse> {
  const res = await fetch('/api/community/puzzles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  return parseJsonOrThrow<CommunityForgeCreateResponse>(res);
}

export async function postCommunityVote(puzzleId: string): Promise<CommunityVoteResponse> {
  const res = await fetch('/api/community/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ puzzleId }),
  });
  return parseJsonOrThrow<CommunityVoteResponse>(res);
}
