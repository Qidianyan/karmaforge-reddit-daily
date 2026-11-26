import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_DIFFICULTIES,
  QUICK_FORGE_PRESETS,
  validateCommunityPuzzleDraft,
} from '../../shared/index.js';
import type {
  CommunityForgeCardInput,
  CommunityForgeDraftInput,
  CommunityForgeListResponse,
  PuzzleCategory,
  PuzzleDifficulty,
} from '../../shared/index.js';
import { AnvilIcon, PlayIcon, UpvoteIcon } from './BrandMark.js';

interface CommunityForgeProps {
  queue: CommunityForgeListResponse | null;
  loading: boolean;
  username: string;
  onRefresh: () => Promise<void>;
  onCreate: (draft: CommunityForgeDraftInput) => Promise<void>;
  onVote: (puzzleId: string) => Promise<void>;
  onPlay: (puzzleId: string) => Promise<void>;
}

function makeEmptyCard(defaultTag: string): CommunityForgeCardInput {
  return {
    subreddit: 'r/AskReddit',
    tag: defaultTag,
    title: '',
    summary: '',
  };
}

function createBlankDraft(): CommunityForgeDraftInput {
  return {
    title: '',
    category: 'Internet Culture',
    subreddit: 'r/KarmaForgeDaily',
    difficulty: 'Spicy',
    openingTitle: '',
    openingExcerpt: '',
    finaleTitle: '',
    finaleExcerpt: '',
    links: [
      makeEmptyCard('Link 1'),
      makeEmptyCard('Link 2'),
      makeEmptyCard('Link 3'),
      makeEmptyCard('Link 4'),
    ],
    trolls: [makeEmptyCard('Troll 1'), makeEmptyCard('Troll 2')],
    hintText: '',
  };
}

export function CommunityForge({
  queue,
  loading,
  username,
  onRefresh,
  onCreate,
  onVote,
  onPlay,
}: CommunityForgeProps) {
  const [draft, setDraft] = useState<CommunityForgeDraftInput>(() => createBlankDraft());
  const [presetIdx, setPresetIdx] = useState(0);
  const [touchedSubmit, setTouchedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const validation = useMemo(() => validateCommunityPuzzleDraft(draft), [draft]);

  const updateLink = (idx: number, patch: Partial<CommunityForgeCardInput>) => {
    setDraft((prev) => {
      const nextLinks = prev.links.map((item, i) => (i === idx ? { ...item, ...patch } : item));
      return { ...prev, links: nextLinks };
    });
  };

  const updateTroll = (idx: number, patch: Partial<CommunityForgeCardInput>) => {
    setDraft((prev) => {
      const nextTrolls = prev.trolls.map((item, i) => (i === idx ? { ...item, ...patch } : item));
      return { ...prev, trolls: nextTrolls };
    });
  };

  const handleLoadSample = () => {
    const preset = QUICK_FORGE_PRESETS[presetIdx % QUICK_FORGE_PRESETS.length]!;
    setDraft({
      ...preset,
      links: preset.links.map((c) => ({ ...c })),
      trolls: preset.trolls.map((c) => ({ ...c })),
    });
    setPresetIdx((prev) => (prev + 1) % QUICK_FORGE_PRESETS.length);
    setTouchedSubmit(false);
    setStatusNotice({
      kind: 'ok',
      text: 'Loaded a verified 4-Link + 2-Troll blueprint. Edit any line or publish straight to the vote board.',
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouchedSubmit(true);
    setStatusNotice(null);

    if (!validation.ok) {
      setStatusNotice({
        kind: 'err',
        text: validation.errors[0] ?? 'Complete all required thread links before publishing.',
      });
      return;
    }

    setSubmitting(true);
    try {
      await onCreate(draft);
      setDraft(createBlankDraft());
      setTouchedSubmit(false);
      setStatusNotice({
        kind: 'ok',
        text: `Published to ${queue?.tomorrowUtc ?? 'tomorrow'} voting queue! Your +1 upvote is live.`,
      });
    } catch (err) {
      setStatusNotice({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Unable to publish community puzzle.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteClick = async (puzzleId: string) => {
    if (votingId) return;
    setVotingId(puzzleId);
    try {
      await onVote(puzzleId);
    } catch (err) {
      setStatusNotice({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Could not record vote.',
      });
    } finally {
      setVotingId(null);
    }
  };

  const handlePlayClick = async (puzzleId: string) => {
    if (playingId) return;
    setPlayingId(puzzleId);
    setStatusNotice(null);
    try {
      await onPlay(puzzleId);
    } catch (err) {
      setStatusNotice({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Unable to launch community puzzle.',
      });
    } finally {
      setPlayingId(null);
    }
  };

  const items = queue?.items ?? [];

  return (
    <div className="kf-community-layout" data-testid="community-forge-view">
      {/* Left Column: Tomorrow's Official Daily Vote Queue */}
      <section className="kf-panel kf-community-queue" aria-label="Tomorrow's daily puzzle vote board">
        <div className="kf-panel-head">
          <div>
            <h2 className="kf-panel-title">Tomorrow’s Daily Ballot</h2>
            <p className="kf-panel-caption">
              Top-voted Reddit thread becomes the pinned UTC {queue?.tomorrowUtc ?? 'next-day'} edition.
            </p>
          </div>
          <div className="kf-queue-telemetry tabular">
            <span>{queue?.totalSubmissions ?? items.length} entries</span>
            <span>{queue?.totalVotes ?? 0} votes</span>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <p className="kf-muted-copy">Loading Redis community vote queue…</p>
        ) : items.length === 0 ? (
          <div className="kf-empty-queue">
            <p className="kf-muted-copy">No community puzzles nominated yet. Forge the first one!</p>
            <button type="button" className="kf-btn-secondary" onClick={() => void onRefresh()}>
              Refresh Queue
            </button>
          </div>
        ) : (
          <div className="kf-nominee-list" data-testid="community-nominee-list">
            {items.map((item, idx) => {
              const isLeader = idx === 0;
              return (
                <article
                  key={item.id}
                  data-testid={`community-item-${item.id}`}
                  className={isLeader ? 'kf-nominee-item kf-nominee-item--leader' : 'kf-nominee-item'}
                >
                  <button
                    type="button"
                    className={item.hasVoted ? 'kf-vote-btn kf-vote-btn--voted' : 'kf-vote-btn'}
                    data-testid={`community-vote-${item.id}`}
                    aria-pressed={item.hasVoted}
                    aria-label={
                      item.hasVoted
                        ? `Remove upvote from ${item.title}`
                        : `Upvote ${item.title} for tomorrow's daily`
                    }
                    disabled={votingId === item.id}
                    onClick={() => void handleVoteClick(item.id)}
                  >
                    <UpvoteIcon />
                    <span className="kf-vote-count tabular">{item.votes}</span>
                  </button>

                  <div className="kf-nominee-body">
                    <h3 className="kf-nominee-title">{item.title}</h3>

                    <div className="kf-nominee-meta">
                      {isLeader && <span className="kf-leader-tag">#1 Frontrunner</span>}
                      {item.hasSolved && <span className="kf-cleared-tag">Cleared</span>}
                      <span className="kf-sub-text">{item.subreddit}</span>
                      <span className="kf-meta-tag">{item.category}</span>
                      <span className="kf-meta-tag">{item.difficulty}</span>
                      <span className="kf-nominee-author">by {item.authorUsername}</span>
                    </div>

                    <div className="kf-nominee-anchors">
                      <span>
                        <strong>OP:</strong> {item.openingPost.title}
                      </span>
                      <span>
                        <strong>Finale:</strong> {item.finalePost.title}
                      </span>
                    </div>

                    <div className="kf-nominee-actions">
                      <button
                        type="button"
                        className="kf-play-thread-btn"
                        data-testid={`community-play-${item.id}`}
                        disabled={playingId === item.id}
                        onClick={() => void handlePlayClick(item.id)}
                      >
                        <PlayIcon />
                        <span>
                          {playingId === item.id
                            ? 'Loading…'
                            : item.hasSolved
                              ? 'Replay Result'
                              : 'Play Thread'}
                        </span>
                      </button>

                      <span className="kf-nominee-stats tabular" data-testid={`community-stats-${item.id}`}>
                        {item.plays ?? 0} play{(item.plays ?? 0) === 1 ? '' : 's'} · {item.clears ?? 0}{' '}
                        clear{(item.clears ?? 0) === 1 ? '' : 's'}
                        {(item.plays ?? 0) > 0 ? ` (${item.clearRatePct ?? 0}%)` : ''}
                      </span>
                    </div>

                    <details className="kf-nominee-details">
                      <summary className="kf-nominee-summary">
                        Spoiler: Inspect 4-Link blueprint &amp; 2 Trolls
                      </summary>
                      <div className="kf-nominee-blueprint">
                        <ol className="kf-blueprint-list">
                          {item.links.map((lnk, lIdx) => (
                            <li key={lIdx}>
                              <span className="kf-sub-text">{lnk.subreddit}</span> {lnk.title}
                            </li>
                          ))}
                        </ol>
                        <div className="kf-blueprint-trolls">
                          {item.trolls.map((troll, tIdx) => (
                            <div key={tIdx} className="kf-blueprint-troll">
                              <strong>Troll {tIdx + 1}:</strong> {troll.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Right Column: 30-Second Community Thread Composer */}
      <section className="kf-panel kf-community-composer" aria-label="Create a tomorrow daily puzzle">
        <div className="kf-panel-head">
          <div>
            <h2 className="kf-panel-title">Forge Tomorrow’s Puzzle</h2>
            <p className="kf-panel-caption">
              Draft 4 causal links and 2 red herrings as {username}.
            </p>
          </div>
          <div className="kf-composer-head-actions">
            <span
              className={
                validation.ok
                  ? 'kf-readiness-pill kf-readiness-pill--ready tabular'
                  : 'kf-readiness-pill tabular'
              }
              data-testid="forge-readiness-pill"
            >
              {validation.readinessPct}% Ready
            </span>
            <button
              type="button"
              className="kf-btn-secondary"
              data-testid="load-sample-forge-btn"
              onClick={handleLoadSample}
            >
              Load Blueprint
            </button>
          </div>
        </div>

        {statusNotice && (
          <div
            role={statusNotice.kind === 'err' ? 'alert' : 'status'}
            data-testid="community-status-banner"
            className={
              statusNotice.kind === 'ok'
                ? 'kf-banner kf-banner--won'
                : 'kf-banner kf-banner--error'
            }
          >
            <span>{statusNotice.text}</span>
          </div>
        )}

        <form className="kf-forge-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="kf-field">
            <label htmlFor="cf-title" className="kf-label">
              Edition Headline
            </label>
            <span id="cf-title-hint" className="kf-field-hint">
              At least 6 characters summarizing the thread arc.
            </span>
            <input
              id="cf-title"
              name="title"
              type="text"
              required
              minLength={6}
              maxLength={84}
              placeholder="How a 1998 Game Boy Camera sparked lo-fi street photography"
              className="kf-input"
              value={draft.title}
              aria-invalid={touchedSubmit && Boolean(validation.fieldErrors.title) ? 'true' : 'false'}
              aria-describedby={
                touchedSubmit && validation.fieldErrors.title
                  ? 'cf-title-hint cf-title-err'
                  : 'cf-title-hint'
              }
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            />
            {touchedSubmit && validation.fieldErrors.title && (
              <span id="cf-title-err" className="kf-field-error">
                Error: {validation.fieldErrors.title}
              </span>
            )}
          </div>

          <div className="kf-form-row-3">
            <div className="kf-field">
              <label htmlFor="cf-subreddit" className="kf-label">
                Subreddit
              </label>
              <input
                id="cf-subreddit"
                name="subreddit"
                type="text"
                required
                placeholder="r/RetroGaming"
                className="kf-input"
                value={draft.subreddit}
                onChange={(e) => setDraft((prev) => ({ ...prev, subreddit: e.target.value }))}
              />
            </div>

            <div className="kf-field">
              <label htmlFor="cf-category" className="kf-label">
                Topic
              </label>
              <select
                id="cf-category"
                name="category"
                className="kf-input"
                value={draft.category}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, category: e.target.value as PuzzleCategory }))
                }
              >
                {COMMUNITY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="kf-field">
              <label htmlFor="cf-difficulty" className="kf-label">
                Difficulty
              </label>
              <select
                id="cf-difficulty"
                name="difficulty"
                className="kf-input"
                value={draft.difficulty}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, difficulty: e.target.value as PuzzleDifficulty }))
                }
              >
                {COMMUNITY_DIFFICULTIES.map((diff) => (
                  <option key={diff} value={diff}>
                    {diff}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="kf-form-row-2">
            <div className="kf-field">
              <label htmlFor="cf-op" className="kf-label">
                Opening Post (OP)
              </label>
              <input
                id="cf-op"
                name="openingTitle"
                type="text"
                required
                minLength={10}
                maxLength={120}
                placeholder="Starting post headline (min 10 chars)"
                className="kf-input"
                value={draft.openingTitle}
                aria-invalid={
                  touchedSubmit && Boolean(validation.fieldErrors.openingTitle) ? 'true' : 'false'
                }
                aria-describedby={
                  touchedSubmit && validation.fieldErrors.openingTitle ? 'cf-op-err' : undefined
                }
                onChange={(e) => setDraft((prev) => ({ ...prev, openingTitle: e.target.value }))}
              />
              {touchedSubmit && validation.fieldErrors.openingTitle && (
                <span id="cf-op-err" className="kf-field-error">
                  Error: {validation.fieldErrors.openingTitle}
                </span>
              )}
            </div>

            <div className="kf-field">
              <label htmlFor="cf-finale" className="kf-label">
                Finale Post
              </label>
              <input
                id="cf-finale"
                name="finaleTitle"
                type="text"
                required
                minLength={10}
                maxLength={120}
                placeholder="Ending payoff headline (min 10 chars)"
                className="kf-input"
                value={draft.finaleTitle}
                aria-invalid={
                  touchedSubmit && Boolean(validation.fieldErrors.finaleTitle) ? 'true' : 'false'
                }
                aria-describedby={
                  touchedSubmit && validation.fieldErrors.finaleTitle ? 'cf-finale-err' : undefined
                }
                onChange={(e) => setDraft((prev) => ({ ...prev, finaleTitle: e.target.value }))}
              />
              {touchedSubmit && validation.fieldErrors.finaleTitle && (
                <span id="cf-finale-err" className="kf-field-error">
                  Error: {validation.fieldErrors.finaleTitle}
                </span>
              )}
            </div>
          </div>

          <fieldset className="kf-fieldset">
            <legend className="kf-legend">4 Ordered Bridge Links (True Chain)</legend>
            <div className="kf-link-inputs">
              {draft.links.map((card, idx) => {
                const errKey = `link_${idx}`;
                const errText = touchedSubmit ? validation.fieldErrors[errKey] : undefined;
                return (
                  <div key={idx} className="kf-link-input-row">
                    <span className="kf-input-badge kf-input-badge--emerald tabular">{idx + 1}</span>
                    <input
                      type="text"
                      required
                      minLength={6}
                      maxLength={96}
                      aria-label={`Bridge Link ${idx + 1} headline`}
                      placeholder={`Link #${idx + 1} step headline`}
                      className="kf-input"
                      value={card.title}
                      aria-invalid={errText ? 'true' : 'false'}
                      onChange={(e) => updateLink(idx, { title: e.target.value })}
                    />
                  </div>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="kf-fieldset">
            <legend className="kf-legend">2 Off-Topic Red Herrings (Plausible Trolls)</legend>
            <div className="kf-link-inputs">
              {draft.trolls.map((card, idx) => {
                const errKey = `troll_${idx}`;
                const errText = touchedSubmit ? validation.fieldErrors[errKey] : undefined;
                return (
                  <div key={idx} className="kf-link-input-row">
                    <span className="kf-input-badge kf-input-badge--amber tabular">T{idx + 1}</span>
                    <input
                      type="text"
                      required
                      minLength={6}
                      maxLength={96}
                      aria-label={`Red Herring Troll ${idx + 1} headline`}
                      placeholder={`Plausible decoy myth #${idx + 1}`}
                      className="kf-input"
                      value={card.title}
                      aria-invalid={errText ? 'true' : 'false'}
                      onChange={(e) => updateTroll(idx, { title: e.target.value })}
                    />
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="kf-field">
            <label htmlFor="cf-hint" className="kf-label">
              Top Comment Clue (optional)
            </label>
            <input
              id="cf-hint"
              name="hintText"
              type="text"
              maxLength={180}
              placeholder="Give stuck solvers a subtle spoiler-free nudge..."
              className="kf-input"
              value={draft.hintText ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, hintText: e.target.value }))}
            />
          </div>

          <div className="kf-forge-submit-row">
            <span className="kf-muted-copy">
              Validated live against 4-Link + 2-Troll uniqueness rules.
            </span>
            <button
              type="submit"
              className="kf-btn-primary"
              data-testid="community-submit-btn"
              disabled={submitting}
            >
              <AnvilIcon />
              <span>{submitting ? 'Publishing…' : 'Submit to Vote Queue'}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
