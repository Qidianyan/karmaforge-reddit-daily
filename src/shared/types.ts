export type PuzzleCategory =
  | 'Science'
  | 'Retro Tech'
  | 'Cooking'
  | 'Cinema'
  | 'Worldbuilding'
  | 'Nature'
  | 'History'
  | 'Internet Culture';

export type PuzzleDifficulty = 'Mild' | 'Spicy' | 'Galaxy Brain';

export interface AnchorPost {
  subreddit: string;
  author: string;
  flair: string;
  upvotes: string;
  title: string;
  excerpt: string;
}

export interface BridgeCard {
  id: string;
  subreddit: string;
  tag: string;
  title: string;
  summary: string;
  isRedHerring: boolean;
  /** Shown after game concludes to explain why this link fits (or why it's an off-topic troll). */
  debrief: string;
}

export interface TopCommentHint {
  author: string;
  upvotes: string;
  text: string;
}

export interface PuzzleDefinition {
  id: string;
  number: number;
  category: PuzzleCategory;
  subreddit: string;
  title: string;
  difficulty: PuzzleDifficulty;
  openingPost: AnchorPost;
  finalePost: AnchorPost;
  /** Ordered 4-tuple of BridgeCard.id forming the exact chain from Opening -> Finale. */
  solutionIds: [string, string, string, string];
  /** Exactly 6 cards: 4 chain links + 2 plausible off-topic red herrings. */
  cards: [BridgeCard, BridgeCard, BridgeCard, BridgeCard, BridgeCard, BridgeCard];
  hints: [TopCommentHint, TopCommentHint];
}

/** Client-safe card payload (hides isRedHerring & debrief while puzzle is still active). */
export interface PublicBridgeCard {
  id: string;
  subreddit: string;
  tag: string;
  title: string;
  summary: string;
}

export interface PublicPuzzlePayload {
  id: string;
  issueNumber: number;
  dateKey: string;
  category: PuzzleCategory;
  subreddit: string;
  title: string;
  difficulty: PuzzleDifficulty;
  openingPost: AnchorPost;
  finalePost: AnchorPost;
  /** Deterministically shuffled 6 bridge cards for this UTC calendar day. */
  cards: PublicBridgeCard[];
  totalHints: number;
}

export type SlotVerdict = 'exact' | 'misplaced' | 'wrong';

export interface GradedSlot {
  cardId: string;
  verdict: SlotVerdict;
}

export interface AttemptRecord {
  attemptNumber: number;
  slots: [GradedSlot, GradedSlot, GradedSlot, GradedSlot];
  exactCount: number;
  misplacedCount: number;
  wrongCount: number;
  submittedAt: string;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface FlairTier {
  minDays: number;
  title: string;
  badge: string;
  flavor: string;
  /** Retro pixel-art badge artwork path under public/art/. */
  artPath: string;
}

export interface SpeedComboBreakdown {
  multiplier: number;
  tierLabel: string;
  baseScore: number;
  streakBonusPct: number;
  finalKarma: number;
}

export interface PlayerStreak {
  currentStreak: number;
  bestStreak: number;
  totalSolved: number;
  lastSolvedDate: string | null;
  flair: FlairTier;
  nextFlair: FlairTier | null;
}

export interface PlayerDailyProgress {
  dateKey: string;
  puzzleId: string;
  status: GameStatus;
  hardMode?: boolean;
  attempts: AttemptRecord[];
  hintsUsed: number;
  startedAt: string;
  completedAt: string | null;
  elapsedSeconds: number | null;
  score: number | null;
  comboMultiplier?: number | null;
  comboLabel?: string | null;
  sharedToThread: boolean;
}

export interface PuzzleSolutionReveal {
  solutionIds: [string, string, string, string];
  debriefByCardId: Record<string, { isRedHerring: boolean; debrief: string }>;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  moves: number;
  elapsedSeconds: number;
  hintsUsed: number;
  score: number;
  flairTitle: string;
  streak: number;
  hardMode?: boolean;
  completedAt: string;
}

export interface MoveDistribution {
  moves1: number;
  moves2: number;
  moves3: number;
  moves4: number;
  moves5: number;
  losses: number;
}

export interface CrowdConsensusBucket {
  key: '1' | '2' | '3' | '4' | '5' | 'X';
  label: string;
  count: number;
  liveCount: number;
  pct: number;
  isPlayerBucket: boolean;
}

export interface CrowdConsensusSummary {
  buckets: CrowdConsensusBucket[];
  sharperThanPct: number;
  headline: string;
  liveSampleSize: number;
  priorSampleSize: number;
  ironForgeSolves: number;
}

export interface DailyCommunityStats {
  totalPlayers: number;
  totalSolves: number;
  solveRatePct: number;
  avgMoves: number | null;
  avgSeconds: number | null;
  ironForgeSolves?: number;
  moveDistribution?: MoveDistribution;
}

export interface SharedCommentItem {
  id: string;
  username: string;
  flairTitle: string;
  markdown: string;
  postedAt: string;
  source: 'reddit' | 'local';
}

export interface GameStateResponse {
  todayUtc: string;
  activeDateKey: string;
  isToday: boolean;
  runtimeMode: 'devvit' | 'local';
  username: string;
  subredditName: string;
  puzzle: PublicPuzzlePayload;
  progress: PlayerDailyProgress;
  revealedHints: TopCommentHint[];
  streak: PlayerStreak;
  stats: DailyCommunityStats;
  crowdConsensus: CrowdConsensusSummary | null;
  leaderboard: LeaderboardEntry[];
  recentShares: SharedCommentItem[];
  solutionReveal: PuzzleSolutionReveal | null;
  shareMarkdown: string | null;
}

export interface GuessRequestBody {
  dateKey?: string;
  cardIds: string[];
  elapsedSeconds?: number;
  hardMode?: boolean;
}

export interface HintRequestBody {
  dateKey?: string;
}

export interface ShareCommentRequestBody {
  dateKey?: string;
}

export interface ShareCommentResponse {
  ok: boolean;
  markdown: string;
  postedTo: 'reddit' | 'local' | 'clipboard-only';
  commentId: string | null;
  message: string;
  recentShares: SharedCommentItem[];
}

export interface ArchiveEditionSummary {
  issueNumber: number;
  dateKey: string;
  puzzleId: string;
  category: PuzzleCategory;
  subreddit: string;
  title: string;
  difficulty: PuzzleDifficulty;
  status: GameStatus | 'unplayed';
  hardMode?: boolean;
  movesUsed: number;
  communitySolves: number;
}

export interface ArchiveResponse {
  todayUtc: string;
  editions: ArchiveEditionSummary[];
}

export interface CommunityForgeCardInput {
  subreddit: string;
  tag: string;
  title: string;
  summary: string;
}

export interface CommunityForgeDraftInput {
  title: string;
  category: PuzzleCategory;
  subreddit: string;
  difficulty: PuzzleDifficulty;
  openingTitle: string;
  openingExcerpt?: string;
  finaleTitle: string;
  finaleExcerpt?: string;
  links: CommunityForgeCardInput[];
  trolls: CommunityForgeCardInput[];
  hintText?: string;
}

export interface CommunityForgeValidationResult {
  ok: boolean;
  errors: string[];
  fieldErrors: Record<string, string>;
  readinessPct: number;
}

export interface CommunityPuzzleSubmission {
  id: string;
  title: string;
  category: PuzzleCategory;
  subreddit: string;
  difficulty: PuzzleDifficulty;
  authorUsername: string;
  createdAt: string;
  targetDateUtc: string;
  openingPost: AnchorPost;
  finalePost: AnchorPost;
  links: [
    CommunityForgeCardInput,
    CommunityForgeCardInput,
    CommunityForgeCardInput,
    CommunityForgeCardInput,
  ];
  trolls: [CommunityForgeCardInput, CommunityForgeCardInput];
  hintText: string;
  votes: number;
  hasVoted: boolean;
  isCuratedSeed?: boolean;
}

export interface CommunityForgeListResponse {
  tomorrowUtc: string;
  items: CommunityPuzzleSubmission[];
  totalSubmissions: number;
  totalVotes: number;
  leadingId: string | null;
}

export interface CommunityForgeCreateResponse {
  ok: boolean;
  submission: CommunityPuzzleSubmission;
  queue: CommunityForgeListResponse;
}

export interface CommunityVoteRequestBody {
  puzzleId: string;
}

export interface CommunityVoteResponse {
  ok: boolean;
  puzzleId: string;
  votes: number;
  hasVoted: boolean;
  queue: CommunityForgeListResponse;
}

export const MAX_ATTEMPTS = 5;
export const IRON_FORGE_MAX_ATTEMPTS = 3;
export const SLOT_COUNT = 4;
export const CARD_POOL_SIZE = 6;
