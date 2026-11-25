import { useMemo, useState } from 'react';
import {
  FLAIR_TIERS,
  MAX_ATTEMPTS,
  computeSpeedCombo,
  formatCountdownHms,
  formatDurationCompact,
  padIssueNumber,
} from '../../shared/index.js';
import type {
  ArchiveEditionSummary,
  DailyCommunityStats,
  GameStateResponse,
  LeaderboardEntry,
  PuzzleCategory,
  SharedCommentItem,
} from '../../shared/index.js';
import { BadgeVault } from './BadgeVault.js';
import { BroadsheetDialog } from './BroadsheetDialog.js';

interface ResultModalProps {
  open: boolean;
  onClose: () => void;
  state: GameStateResponse;
  countdownSeconds: number;
  sharing: boolean;
  shareNotice: string | null;
  onShareComment: () => void;
  onCopyOnly: () => void;
  onOpenLeaderboard: () => void;
  onOpenArchive: () => void;
  onOpenCommunityForge: () => void;
}

export function ResultModal({
  open,
  onClose,
  state,
  countdownSeconds,
  sharing,
  shareNotice,
  onShareComment,
  onCopyOnly,
  onOpenLeaderboard,
  onOpenArchive,
  onOpenCommunityForge,
}: ResultModalProps) {
  const { progress, puzzle, streak, solutionReveal, shareMarkdown } = state;
  const won = progress.status === 'won';
  const cardById = useMemo(() => new Map(puzzle.cards.map((c) => [c.id, c])), [puzzle.cards]);

  const title = won
    ? `Thread Forged · Issue #${padIssueNumber(puzzle.issueNumber)}`
    : `Thread Locked · Issue #${padIssueNumber(puzzle.issueNumber)}`;

  const redHerringCards = useMemo(() => {
    if (!solutionReveal) return [];
    const solSet = new Set(solutionReveal.solutionIds);
    return puzzle.cards.filter((c) => !solSet.has(c.id));
  }, [puzzle.cards, solutionReveal]);

  const combo = useMemo(() => {
    if (!won) return null;
    return computeSpeedCombo({
      moves: Math.max(1, progress.attempts.length),
      elapsedSeconds: progress.elapsedSeconds ?? 45,
      hintsUsed: progress.hintsUsed,
      currentStreak: streak.currentStreak,
    });
  }, [progress.attempts.length, progress.elapsedSeconds, progress.hintsUsed, streak.currentStreak, won]);

  return (
    <BroadsheetDialog open={open} title={title} onClose={onClose}>
      <div className={won ? 'kf-banner kf-banner--won' : 'kf-banner kf-banner--feedback'}>
        <span>
          {won
            ? `Clean chain forged in ${progress.attempts.length}/${MAX_ATTEMPTS} moves. ${streak.flair.title} flair active.`
            : 'Out of attempts. Inspect the verified chain below or try another edition.'}
        </span>
        <span className="tabular kf-mono">UTC {formatCountdownHms(countdownSeconds)}</span>
      </div>

      <div className="kf-score-grid">
        <div className="kf-stat-box">
          <span className="kf-stat-val tabular">
            {won ? `${progress.attempts.length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`}
          </span>
          <span className="kf-stat-lbl">Moves</span>
        </div>
        <div className="kf-stat-box">
          <span className="kf-stat-val tabular">{formatDurationCompact(progress.elapsedSeconds)}</span>
          <span className="kf-stat-lbl">Solve Time</span>
        </div>
        <div className="kf-stat-box">
          <span className="kf-stat-val kf-stat-val--flame tabular">
            {combo ? `${combo.multiplier.toFixed(2)}x` : '0x'}
          </span>
          <span className="kf-stat-lbl">{combo ? combo.tierLabel : 'Combo'}</span>
        </div>
        <div className="kf-stat-box">
          <span className="kf-stat-val kf-stat-val--emerald tabular">{progress.score ?? 0}</span>
          <span className="kf-stat-lbl">Karma</span>
        </div>
      </div>

      <div>
        <div className="kf-panel-head">
          <h3 className="kf-panel-title">Pixel Badge Collection</h3>
          <span className="kf-panel-sub tabular">
            {streak.currentStreak}d active streak
          </span>
        </div>
        <BadgeVault currentStreak={streak.currentStreak} bestStreak={streak.bestStreak} compact />
        {streak.nextFlair && (
          <p className="kf-muted-copy kf-next-flair-note">
            Next Flair: <strong>{streak.nextFlair.title}</strong> ({streak.nextFlair.minDays}-day
            streak, {Math.max(1, streak.nextFlair.minDays - streak.currentStreak)} day
            {streak.nextFlair.minDays - streak.currentStreak === 1 ? '' : 's'} remaining).
          </p>
        )}
      </div>

      {shareMarkdown && (
        <div className="kf-share-card">
          <div className="kf-panel-head">
            <h3 className="kf-panel-title">Spoiler-Free Reddit Comment Grid</h3>
            <span className="kf-panel-sub">Safe for daily thread</span>
          </div>
          <pre className="kf-share-pre" data-testid="share-markdown-preview">
            {shareMarkdown}
          </pre>
          <div className="kf-share-actions">
            <button
              type="button"
              className="kf-btn-primary"
              data-testid="post-share-comment-btn"
              disabled={sharing}
              onClick={onShareComment}
            >
              {sharing
                ? 'Posting…'
                : progress.sharedToThread
                  ? 'Post Comment Again'
                  : '1-Click Post Comment'}
            </button>
            <button type="button" className="kf-btn-secondary" onClick={onCopyOnly}>
              Copy Grid
            </button>
            <button type="button" className="kf-btn-secondary" onClick={onOpenLeaderboard}>
              Leaderboard
            </button>
            <button type="button" className="kf-btn-secondary" onClick={onOpenCommunityForge}>
              Vote Tomorrow
            </button>
            <button type="button" className="kf-btn-secondary" onClick={onOpenArchive}>
              Archive
            </button>
          </div>
          {shareNotice && (
            <p role="status" data-testid="share-status-notice" className="kf-share-notice">
              {shareNotice}
            </p>
          )}
        </div>
      )}

      {solutionReveal && (
        <div>
          <div className="kf-panel-head">
            <h3 className="kf-panel-title">Verified Thread Chain &amp; Unmasked Trolls</h3>
            <span className="kf-panel-sub">{puzzle.category}</span>
          </div>
          <div className="kf-debrief-list">
            {solutionReveal.solutionIds.map((id, idx) => {
              const card = cardById.get(id);
              const detail = solutionReveal.debriefByCardId[id];
              return (
                <div key={id} className="kf-debrief-item">
                  <strong>
                    Link {idx + 1}: {card?.title ?? id}
                  </strong>
                  <span>{detail?.debrief}</span>
                </div>
              );
            })}
            {redHerringCards.map((card) => {
              const detail = solutionReveal.debriefByCardId[card.id];
              return (
                <div key={card.id} className="kf-debrief-item kf-debrief-item--troll">
                  <strong>Off-Topic Red Herring: {card.title}</strong>
                  <span>{detail?.debrief}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </BroadsheetDialog>
  );
}

interface LeaderboardModalProps {
  open: boolean;
  onClose: () => void;
  issueNumber: number;
  dateKey: string;
  subredditName: string;
  stats: DailyCommunityStats;
  leaderboard: LeaderboardEntry[];
  recentShares: SharedCommentItem[];
  currentUsername: string;
}

export function LeaderboardModal({
  open,
  onClose,
  issueNumber,
  dateKey,
  subredditName,
  stats,
  leaderboard,
  recentShares,
  currentUsername,
}: LeaderboardModalProps) {
  return (
    <BroadsheetDialog
      open={open}
      title={`Daily Leaderboard · Issue #${padIssueNumber(issueNumber)}`}
      onClose={onClose}
    >
      <div className="kf-muted-copy">
        {subredditName} · UTC Edition <strong className="tabular">{dateKey}</strong>
      </div>

      <div className="kf-score-grid">
        <div className="kf-stat-box">
          <span className="kf-stat-val tabular">{stats.totalPlayers}</span>
          <span className="kf-stat-lbl">Players</span>
        </div>
        <div className="kf-stat-box">
          <span className="kf-stat-val kf-stat-val--emerald tabular">{stats.solveRatePct}%</span>
          <span className="kf-stat-lbl">Solve Rate</span>
        </div>
        <div className="kf-stat-box">
          <span className="kf-stat-val tabular">{stats.avgMoves ?? '--'}</span>
          <span className="kf-stat-lbl">Avg Moves</span>
        </div>
        <div className="kf-stat-box">
          <span className="kf-stat-val tabular">{formatDurationCompact(stats.avgSeconds)}</span>
          <span className="kf-stat-lbl">Avg Time</span>
        </div>
      </div>

      <div>
        <div className="kf-panel-head">
          <h3 className="kf-panel-title">Fastest Thread Architects</h3>
          <span className="kf-panel-sub">Ranked by moves, then speed</span>
        </div>

        {leaderboard.length === 0 ? (
          <p className="kf-muted-copy">
            No completed runs logged for this edition yet. Forge the 4-link thread to claim Rank #1.
          </p>
        ) : (
          <table className="kf-lb-table" data-testid="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Redditor</th>
                <th>Moves</th>
                <th>Time</th>
                <th>Karma</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry) => {
                const isSelf = entry.username === currentUsername;
                return (
                  <tr key={`${entry.rank}-${entry.username}`} className={isSelf ? 'kf-lb-self' : undefined}>
                    <td className="tabular">#{entry.rank}</td>
                    <td>
                      <div className="kf-lb-user">{entry.username}</div>
                      <div className="kf-lb-sub">
                        {entry.flairTitle}
                        {entry.streak > 0 ? ` · ${entry.streak}d streak` : ''}
                      </div>
                    </td>
                    <td className="tabular">
                      {entry.moves}/{MAX_ATTEMPTS}
                    </td>
                    <td className="tabular">{formatDurationCompact(entry.elapsedSeconds)}</td>
                    <td className="tabular kf-lb-karma">{entry.score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <div className="kf-panel-head">
          <h3 className="kf-panel-title">Spoiler-Free Thread Comments</h3>
          <span className="kf-panel-sub">{recentShares.length} shared</span>
        </div>
        {recentShares.length === 0 ? (
          <p className="kf-muted-copy">
            Finish the puzzle and post your spoiler-free comment grid to appear here.
          </p>
        ) : (
          <div className="kf-comment-feed" data-testid="shared-comments-feed">
            {recentShares.map((item) => (
              <article key={item.id} className="kf-comment-card">
                <div className="kf-comment-head">
                  <span>
                    {item.username} · <span className="kf-amber-text">{item.flairTitle}</span>
                  </span>
                  <span className="kf-muted-copy">
                    {item.source === 'reddit' ? 'Reddit Thread' : 'Local Thread'}
                  </span>
                </div>
                <pre className="kf-comment-body">{item.markdown}</pre>
              </article>
            ))}
          </div>
        )}
      </div>
    </BroadsheetDialog>
  );
}

interface ArchiveModalProps {
  open: boolean;
  onClose: () => void;
  editions: ArchiveEditionSummary[];
  activeDateKey: string;
  todayUtc: string;
  onSelectDate: (dateKey: string) => void;
}

const ALL_CATEGORIES: Array<'All' | PuzzleCategory> = [
  'All',
  'Science',
  'Retro Tech',
  'Cooking',
  'Cinema',
  'Worldbuilding',
  'Nature',
  'History',
  'Internet Culture',
];

export function ArchiveModal({
  open,
  onClose,
  editions,
  activeDateKey,
  todayUtc,
  onSelectDate,
}: ArchiveModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<'All' | PuzzleCategory>('All');

  const filtered = useMemo(() => {
    if (selectedCategory === 'All') return editions;
    return editions.filter((ed) => ed.category === selectedCategory);
  }, [editions, selectedCategory]);

  const chronologicalHeatmap = useMemo(() => [...editions].reverse(), [editions]);
  const solvedCount = useMemo(
    () => editions.filter((ed) => ed.status === 'won').length,
    [editions],
  );

  return (
    <BroadsheetDialog open={open} title="Archive Terminal · 30 Handcrafted Editions" onClose={onClose}>
      <section className="kf-heatmap-box" aria-label="30-day daily solve streak heatmap">
        <div className="kf-heatmap-head">
          <span className="kf-heatmap-title">30-Day Streak Heatmap</span>
          <span className="kf-heatmap-count tabular">
            {solvedCount}/{editions.length || 30} Solved
          </span>
        </div>

        <div className="kf-heatmap-grid" data-testid="archive-heatmap">
          {chronologicalHeatmap.map((ed) => {
            const isCurrent = ed.dateKey === activeDateKey;
            const isFastWin = ed.status === 'won' && ed.movesUsed > 0 && ed.movesUsed <= 2;
            const dayNum = ed.dateKey.slice(8, 10);
            const cellClass = [
              'kf-heatmap-cell',
              'tabular',
              ed.status === 'won'
                ? isFastWin
                  ? 'kf-heatmap-cell--fast'
                  : 'kf-heatmap-cell--won'
                : `kf-heatmap-cell--${ed.status}`,
              isCurrent ? 'kf-heatmap-cell--current' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={ed.dateKey}
                type="button"
                className={cellClass}
                data-status={ed.status}
                title={`#${padIssueNumber(ed.issueNumber)} (${ed.dateKey}): ${ed.title} (${ed.status})`}
                aria-label={`Issue #${padIssueNumber(ed.issueNumber)} on ${ed.dateKey}, ${ed.status}`}
                onClick={() => {
                  onSelectDate(ed.dateKey);
                  onClose();
                }}
              >
                {dayNum}
              </button>
            );
          })}
        </div>

        <div className="kf-heatmap-legend" aria-hidden="true">
          <span className="kf-legend-item">
            <span className="kf-legend-swatch kf-legend-swatch--fast" />
            <span>Flash Solve</span>
          </span>
          <span className="kf-legend-item">
            <span className="kf-legend-swatch kf-legend-swatch--won" />
            <span>Solved</span>
          </span>
          <span className="kf-legend-item">
            <span className="kf-legend-swatch kf-legend-swatch--playing" />
            <span>Active</span>
          </span>
          <span className="kf-legend-item">
            <span className="kf-legend-swatch kf-legend-swatch--lost" />
            <span>Missed</span>
          </span>
          <span className="kf-legend-item">
            <span className="kf-legend-swatch kf-legend-swatch--unplayed" />
            <span>Open</span>
          </span>
        </div>
      </section>

      <div className="kf-filter-row" role="tablist" aria-label="Filter archive by category">
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={selectedCategory === cat}
            className={`kf-filter-pill ${selectedCategory === cat ? 'kf-filter-pill--active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="kf-archive-list" data-testid="archive-edition-list">
        {filtered.map((ed) => {
          const isCurrent = ed.dateKey === activeDateKey;
          const isToday = ed.dateKey === todayUtc;
          const badgeLabel =
            ed.status === 'won'
              ? `Solved ${ed.movesUsed}/${MAX_ATTEMPTS}`
              : ed.status === 'lost'
                ? 'Missed'
                : ed.status === 'playing'
                  ? `Active (${ed.movesUsed}/${MAX_ATTEMPTS})`
                  : 'Play';

          return (
            <button
              key={ed.dateKey}
              type="button"
              className={`kf-archive-row ${isCurrent ? 'kf-archive-row--current' : ''}`}
              onClick={() => {
                onSelectDate(ed.dateKey);
                onClose();
              }}
            >
              <div className="kf-archive-meta-col">
                <div className="kf-archive-meta-line">
                  <span className="tabular">#{padIssueNumber(ed.issueNumber)}</span>
                  <span>{ed.dateKey}{isToday ? ' (Today)' : ''}</span>
                  <span className="kf-meta-tag">{ed.category}</span>
                  <span className="kf-meta-tag">{ed.difficulty}</span>
                </div>
                <div className="kf-archive-title">{ed.title}</div>
              </div>
              <span className={`kf-status-badge kf-status-badge--${ed.status}`}>{badgeLabel}</span>
            </button>
          );
        })}
      </div>
    </BroadsheetDialog>
  );
}

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  currentStreak: number;
  bestStreak: number;
}

export function HelpModal({ open, onClose, currentStreak, bestStreak }: HelpModalProps) {
  return (
    <BroadsheetDialog open={open} title="How to Play KarmaForge" onClose={onClose}>
      <p className="kf-help-intro">
        Every UTC midnight opens a fresh 60-second Reddit thread puzzle. Connect the{' '}
        <strong>Opening Post</strong> to the <strong>Finale Post</strong> by forging the exact{' '}
        <strong>4-link Bridge Chain</strong> in <strong>5 attempts or fewer</strong>, while dodging{' '}
        <strong>2 off-topic Red Herrings</strong>.
      </p>

      <div className="kf-debrief-list">
        <div className="kf-debrief-item">
          <strong>Emerald Lock: Exact Link (Auto-Locked)</strong>
          <span>Right bridge post in the exact slot. Locks into the thread spine for remaining turns.</span>
        </div>
        <div className="kf-debrief-item kf-debrief-item--amber">
          <strong>Amber Signal: Right Post, Wrong Order</strong>
          <span>Belongs in the thread chain, just drag or swap it earlier or later along the spine.</span>
        </div>
        <div className="kf-debrief-item kf-debrief-item--troll">
          <strong>Charcoal Strike: Off-Topic Red Herring</strong>
          <span>Plausible folklore myth or tangent. Remove it and slot a genuine causal link.</span>
        </div>
      </div>

      <div>
        <div className="kf-panel-head">
          <h3 className="kf-panel-title">Keyboard Speedflow &amp; Drag Controls</h3>
          <span className="kf-panel-sub">Instant input</span>
        </div>
        <div className="kf-kbd-legend">
          <span>
            <kbd className="kf-kbd">1</kbd> to <kbd className="kf-kbd">6</kbd> Place bridge card
          </span>
          <span>
            <kbd className="kf-kbd">Enter</kbd> Forge thread
          </span>
          <span>
            <kbd className="kf-kbd">Z</kbd> Undo move
          </span>
          <span>
            <kbd className="kf-kbd">H</kbd> Reveal clue
          </span>
        </div>
      </div>

      <div>
        <div className="kf-panel-head">
          <h3 className="kf-panel-title">Streak Flairs &amp; Pixel Badges</h3>
          <span className="kf-panel-sub">UTC Calendar Streak</span>
        </div>
        <BadgeVault currentStreak={currentStreak} bestStreak={bestStreak} compact />
        <div className="kf-flair-ladder">
          {FLAIR_TIERS.map((tier) => (
            <span key={tier.minDays} className="kf-streak-pill">
              <strong>Day {tier.minDays}:</strong> {tier.title}
            </span>
          ))}
        </div>
      </div>
    </BroadsheetDialog>
  );
}
