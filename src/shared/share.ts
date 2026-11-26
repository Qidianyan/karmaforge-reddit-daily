import { computeSpeedCombo, getMaxAttempts } from './engine.js';
import type {
  AttemptRecord,
  CrowdConsensusSummary,
  GameStatus,
  PlayerStreak,
  PublicPuzzlePayload,
  SlotVerdict,
} from './types.js';

const VERDICT_EMOJI: Record<SlotVerdict, string> = {
  exact: '🟩',
  misplaced: '🟨',
  wrong: '⬛',
};

export function formatAttemptRowEmoji(attempt: AttemptRecord): string {
  return attempt.slots.map((slot) => VERDICT_EMOJI[slot.verdict]).join('');
}

export function formatDurationCompact(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return '--';
  }
  const rounded = Math.max(1, Math.round(seconds));
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export function padIssueNumber(issueNumber: number): string {
  return String(Math.max(1, issueNumber)).padStart(3, '0');
}

export function generateSpoilerFreeShareMarkdown(params: {
  puzzle: Pick<PublicPuzzlePayload, 'issueNumber' | 'title' | 'category'>;
  status: GameStatus;
  attempts: AttemptRecord[];
  elapsedSeconds: number | null;
  hintsUsed: number;
  streak: Pick<PlayerStreak, 'currentStreak' | 'flair'>;
  hardMode?: boolean;
  crowdConsensus?: CrowdConsensusSummary | null;
}): string {
  const { puzzle, status, attempts, elapsedSeconds, hintsUsed, streak, hardMode, crowdConsensus } =
    params;
  const issueTag = `#${padIssueNumber(puzzle.issueNumber)}`;
  const maxAttempts = getMaxAttempts(hardMode);
  const moveScore = status === 'won' ? `${attempts.length}/${maxAttempts}` : `X/${maxAttempts}`;
  const gridLines = attempts.map(formatAttemptRowEmoji);
  const lastRow = gridLines[gridLines.length - 1] ?? '⬛⬛⬛⬛';
  const timeText = formatDurationCompact(elapsedSeconds);
  const hintSuffix = hintsUsed > 0 ? ` | Clue x${hintsUsed}` : '';
  const ironTag = hardMode && status === 'won' ? ' · ⚒️ IRON FORGE' : hardMode ? ' · Iron Forge' : '';
  const streakPart =
    streak.currentStreak > 0
      ? `🔥 ${streak.currentStreak}-day streak (${streak.flair.title})`
      : `${streak.flair.title}`;

  const combo =
    status === 'won'
      ? computeSpeedCombo({
          moves: attempts.length || 1,
          elapsedSeconds: elapsedSeconds ?? 60,
          hintsUsed,
          currentStreak: streak.currentStreak,
          hardMode,
        })
      : null;

  const percentileSuffix =
    status === 'won' && crowdConsensus && crowdConsensus.sharperThanPct > 0
      ? ` | 🏆 ${crowdConsensus.headline}`
      : '';

  const comboLine = combo
    ? `> ⚡ **${combo.multiplier.toFixed(2)}x ${combo.tierLabel}** | **${combo.finalKarma} Karma**${percentileSuffix}`
    : '> 🔒 Thread locked for today, try tomorrow’s Community Forge winner!';

  return [
    `${lastRow} **KarmaForge ${issueTag}**${ironTag} | ${moveScore} moves (${timeText}${hintSuffix}) | ${streakPart}`,
    `*${puzzle.category}: "${puzzle.title}"*`,
    comboLine,
    '',
    ...gridLines,
    '',
    'Forge today’s 4-link subreddit thread in 60s (spoiler-free!).',
  ].join('\n');
}
