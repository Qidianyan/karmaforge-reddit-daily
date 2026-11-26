import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  MICRO_GUIDE_STORAGE_KEY,
  SLOT_COUNT,
  computeSpeedCombo,
  extractKnownCardStatuses,
  formatDurationCompact,
  getIssueNumberForDate,
  getMaxAttempts,
  getSecondsUntilNextUtcDay,
  padIssueNumber,
  shouldShowMicroGuide,
  validateIronForgeConstraints,
} from '../shared/index.js';
import type {
  ArchiveEditionSummary,
  CommunityForgeDraftInput,
  CommunityForgeListResponse,
  CreatorLeaderboardEntry,
  DailyCommunityStats,
  GameStateResponse,
  LeaderboardEntry,
  SharedCommentItem,
  SlotVerdict,
} from '../shared/index.js';
import {
  fetchArchive,
  fetchCommunityPlayState,
  fetchCommunityPuzzles,
  fetchGameState,
  fetchLeaderboard,
  postCommunityGuess,
  postCommunityHint,
  postCommunityPuzzle,
  postCommunityShare,
  postCommunityVote,
  postGuess,
  postHint,
  postShareComment,
} from './api.js';
import { BadgeVault } from './components/BadgeVault.js';
import {
  AnvilIcon,
  ArchiveIcon,
  BoltIcon,
  ClockIcon,
  ClueIcon,
  DragHandleIcon,
  FlameIcon,
  KarmaForgeMark,
  SoundIcon,
  TerminalIcon,
  TrophyIcon,
  UndoIcon,
} from './components/BrandMark.js';
import { CommunityForge } from './components/CommunityForge.js';
import { ArchiveModal, HelpModal, LeaderboardModal, ResultModal } from './components/Modals.js';
import { playAttemptFeedback, playKeyClick, playToggleChime, playVictoryChord } from './sound.js';

type SlotArray = [string | null, string | null, string | null, string | null];
type ActiveTab = 'daily' | 'community';

const IRON_FORGE_PREF_KEY = 'karmaforge:iron_forge_pref:v1';

function readStoredFlag(key: string): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeStoredFlag(key: string, enabled: boolean): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, enabled ? '1' : '0');
    }
  } catch {
    // Ignore storage failures in restricted iframes.
  }
}

function findFirstOpenUnlockedSlot(slots: SlotArray, locked: (string | null)[]): number {
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    if (!locked[i] && !slots[i]) {
      return i;
    }
  }
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    if (!locked[i]) {
      return i;
    }
  }
  return 0;
}

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('daily');
  const [state, setState] = useState<GameStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const [slots, setSlots] = useState<SlotArray>([null, null, null, null]);
  const [slotHistory, setSlotHistory] = useState<SlotArray[]>([]);
  const [activeSlot, setActiveSlot] = useState<number>(0);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [revealPulse, setRevealPulse] = useState<number>(0);
  const [dirtySlots, setDirtySlots] = useState<boolean[]>([false, false, false, false]);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [ironForgePref, setIronForgePref] = useState<boolean>(() =>
    readStoredFlag(IRON_FORGE_PREF_KEY),
  );
  const [guideDismissed, setGuideDismissed] = useState<boolean>(() =>
    readStoredFlag(MICRO_GUIDE_STORAGE_KEY),
  );
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(() =>
    getSecondsUntilNextUtcDay(),
  );

  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [leaderboardModalOpen, setLeaderboardModalOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  const [archiveEditions, setArchiveEditions] = useState<ArchiveEditionSummary[]>([]);
  const [sharing, setSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  const [communityQueue, setCommunityQueue] = useState<CommunityForgeListResponse | null>(null);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [ranksSnapshot, setRanksSnapshot] = useState<{
    dateKey: string;
    stats: DailyCommunityStats;
    leaderboard: LeaderboardEntry[];
    ironForgeLeaderboard: LeaderboardEntry[];
    topForgers: CreatorLeaderboardEntry[];
    recentShares: SharedCommentItem[];
  } | null>(null);

  const dragCardRef = useRef<{ cardId: string; fromSlot: number | null } | null>(null);
  const timerStartRef = useRef<number>(Date.now());
  const communitySeqRef = useRef<number>(0);
  const ranksSeqRef = useRef<number>(0);

  const syncFromState = useCallback((next: GameStateResponse, isFreshSubmission = false) => {
    setState(next);
    if (!next.communityMeta) {
      setRanksSnapshot(null);
    }
    setShareNotice(null);
    setSlotHistory([]);

    const attempts = next.progress.attempts;
    const latest = attempts[attempts.length - 1];
    const known = extractKnownCardStatuses(attempts);

    if (next.progress.status === 'won' && next.solutionReveal) {
      setSlots([...next.solutionReveal.solutionIds]);
      setDirtySlots([false, false, false, false]);
      setElapsedSeconds(next.progress.elapsedSeconds ?? 0);
    } else if (latest) {
      const displaySlots: SlotArray = [
        latest.slots[0].cardId,
        latest.slots[1].cardId,
        latest.slots[2].cardId,
        latest.slots[3].cardId,
      ];
      setSlots(displaySlots);
      setDirtySlots([false, false, false, false]);
      setActiveSlot(findFirstOpenUnlockedSlot(displaySlots, known.lockedSlots));
      if (next.progress.elapsedSeconds !== null) {
        setElapsedSeconds(next.progress.elapsedSeconds);
      } else if (!isFreshSubmission && next.progress.status === 'playing') {
        const startedMs = Date.parse(next.progress.startedAt);
        const safeStart = Number.isFinite(startedMs) && startedMs <= Date.now() ? startedMs : Date.now();
        timerStartRef.current = safeStart;
        setElapsedSeconds(Math.max(1, Math.floor((Date.now() - safeStart) / 1000)));
      }
    } else {
      setSlots([null, null, null, null]);
      setDirtySlots([false, false, false, false]);
      setActiveSlot(0);
      timerStartRef.current = Date.now();
      setElapsedSeconds(0);
    }

    if (isFreshSubmission && latest) {
      const attemptCap = getMaxAttempts(next.progress.hardMode);
      setRevealPulse((prev) => prev + 1);
      if (next.progress.status === 'won') {
        const ironPrefix = next.progress.hardMode ? 'IRON FORGE · ' : '';
        setFeedbackBanner(
          `${ironPrefix}Thread Forged in ${attempts.length}/${attemptCap} moves. ${next.streak.flair.title} flair active.`,
        );
      } else if (next.progress.status === 'lost') {
        setFeedbackBanner('Out of attempts. Open Debrief to inspect the verified chain.');
      } else {
        setFeedbackBanner(
          `Attempt ${attempts.length}/${attemptCap}: ${latest.exactCount} Exact, ${latest.misplacedCount} Wrong Order, ${latest.wrongCount} Red Herring${latest.wrongCount === 1 ? '' : 's'}.`,
        );
      }
    } else {
      setFeedbackBanner(null);
    }
  }, []);

  const loadDate = useCallback(
    async (dateKey?: string) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const data = await fetchGameState(dateKey);
        syncFromState(data, false);
        setResultModalOpen(false);
        setActiveTab('daily');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load today’s thread.');
      } finally {
        setLoading(false);
      }
    },
    [syncFromState],
  );

  const loadCommunityPuzzle = useCallback(
    async (puzzleId: string) => {
      setErrorMsg(null);
      const data = await fetchCommunityPlayState(puzzleId);
      syncFromState(data, false);
      setResultModalOpen(false);
      setActiveTab('daily');
    },
    [syncFromState],
  );

  const loadCommunityQueue = useCallback(async () => {
    const seq = ++communitySeqRef.current;
    setCommunityLoading(true);
    try {
      const data = await fetchCommunityPuzzles();
      if (seq === communitySeqRef.current) {
        setCommunityQueue(data);
      }
    } catch {
      // Non-fatal on boot; user can retry inside Community Forge tab.
    } finally {
      if (seq === communitySeqRef.current) {
        setCommunityLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDate();
    void loadCommunityQueue();
  }, [loadDate, loadCommunityQueue]);

  // Live 1-second timer for active game + UTC midnight countdown.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setCountdownSeconds(getSecondsUntilNextUtcDay());
      if (state && state.progress.status === 'playing') {
        const secs = Math.max(1, Math.floor((Date.now() - timerStartRef.current) / 1000));
        setElapsedSeconds(secs);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [state]);

  const known = useMemo(() => {
    return extractKnownCardStatuses(state?.progress.attempts ?? []);
  }, [state?.progress.attempts]);

  const cardById = useMemo(() => {
    return new Map((state?.puzzle.cards ?? []).map((card) => [card.id, card]));
  }, [state?.puzzle.cards]);

  const latestAttempt = useMemo(() => {
    const list = state?.progress.attempts ?? [];
    return list.length > 0 ? list[list.length - 1] : null;
  }, [state?.progress.attempts]);

  const isPlaying = state?.progress.status === 'playing';
  const isHardModeLocked =
    (state?.progress.attempts.length ?? 0) > 0 || state?.progress.status !== 'playing';
  const effectiveHardMode = isHardModeLocked
    ? Boolean(state?.progress.hardMode)
    : ironForgePref;
  const activeMaxAttempts = getMaxAttempts(effectiveHardMode);

  const dismissMicroGuide = useCallback(() => {
    setGuideDismissed((prev) => {
      if (!prev) {
        writeStoredFlag(MICRO_GUIDE_STORAGE_KEY, true);
      }
      return true;
    });
  }, []);

  const handleToggleIronForge = useCallback(() => {
    if (isHardModeLocked) return;
    setIronForgePref((prev) => {
      const next = !prev;
      writeStoredFlag(IRON_FORGE_PREF_KEY, next);
      playToggleChime(soundEnabled);
      return next;
    });
    setErrorMsg(null);
  }, [isHardModeLocked, soundEnabled]);

  const liveCombo = useMemo(() => {
    const moves = Math.max(1, (state?.progress.attempts.length ?? 0) + (isPlaying ? 1 : 0));
    const secs = state?.progress.elapsedSeconds ?? Math.max(1, elapsedSeconds);
    return computeSpeedCombo({
      moves,
      elapsedSeconds: secs,
      hintsUsed: state?.progress.hintsUsed ?? 0,
      currentStreak: state?.streak.currentStreak ?? 0,
      hardMode: effectiveHardMode,
    });
  }, [
    effectiveHardMode,
    elapsedSeconds,
    isPlaying,
    state?.progress.attempts.length,
    state?.progress.elapsedSeconds,
    state?.progress.hintsUsed,
    state?.streak.currentStreak,
  ]);

  const getDisplayedVerdict = useCallback(
    (slotIdx: number, cardId: string | null): SlotVerdict | null => {
      if (!cardId) return null;
      if (known.lockedSlots[slotIdx] === cardId) return 'exact';
      if (dirtySlots[slotIdx]) return null;
      if (latestAttempt && latestAttempt.slots[slotIdx]?.cardId === cardId) {
        return latestAttempt.slots[slotIdx]!.verdict;
      }
      return null;
    },
    [dirtySlots, known.lockedSlots, latestAttempt],
  );

  const pushHistory = useCallback((snapshot: SlotArray) => {
    setSlotHistory((prev) => [...prev.slice(-15), [...snapshot] as SlotArray]);
  }, []);

  const placeCardInSlot = useCallback(
    (cardId: string, targetSlot: number) => {
      if (!isPlaying) return;
      if (known.lockedSlots[targetSlot]) return;
      if (effectiveHardMode && known.knownWrongIds.has(cardId)) {
        setErrorMsg('Iron Forge rule: Eliminated Red Herrings cannot be replayed.');
        return;
      }

      dismissMicroGuide();
      playKeyClick(soundEnabled);
      setErrorMsg(null);

      setSlots((prev) => {
        const next: SlotArray = [...prev] as SlotArray;
        const nextDirty = [...dirtySlots];

        const existingSlot = next.indexOf(cardId);
        if (existingSlot !== -1 && !known.lockedSlots[existingSlot]) {
          if (existingSlot === targetSlot) return prev;
          pushHistory(prev);
          const displaced = next[targetSlot];
          next[targetSlot] = cardId;
          next[existingSlot] = displaced ?? null;
          nextDirty[targetSlot] = true;
          nextDirty[existingSlot] = true;
        } else if (existingSlot === -1) {
          pushHistory(prev);
          next[targetSlot] = cardId;
          nextDirty[targetSlot] = true;
        } else {
          return prev;
        }

        setDirtySlots(nextDirty);
        setActiveSlot(findFirstOpenUnlockedSlot(next, known.lockedSlots));
        return next;
      });
    },
    [
      dirtySlots,
      dismissMicroGuide,
      effectiveHardMode,
      isPlaying,
      known.knownWrongIds,
      known.lockedSlots,
      pushHistory,
      soundEnabled,
    ],
  );

  const handleSwapAdjacentSlot = useCallback(
    (slotIdx: number, direction: -1 | 1) => {
      if (!isPlaying || known.lockedSlots[slotIdx]) return;
      let targetIdx = slotIdx + direction;
      while (targetIdx >= 0 && targetIdx < SLOT_COUNT && known.lockedSlots[targetIdx]) {
        targetIdx += direction;
      }
      if (targetIdx < 0 || targetIdx >= SLOT_COUNT) return;

      playKeyClick(soundEnabled);
      setSlots((prev) => {
        pushHistory(prev);
        const next: SlotArray = [...prev] as SlotArray;
        const tmp = next[slotIdx] ?? null;
        next[slotIdx] = next[targetIdx] ?? null;
        next[targetIdx] = tmp;
        return next;
      });
      setDirtySlots((prev) => {
        const next = [...prev];
        next[slotIdx] = true;
        next[targetIdx] = true;
        return next;
      });
      setActiveSlot(targetIdx);
    },
    [isPlaying, known.lockedSlots, pushHistory, soundEnabled],
  );

  const handleTapBridgeCard = useCallback(
    (cardId: string) => {
      if (!isPlaying) return;
      const existingSlot = slots.indexOf(cardId);
      if (existingSlot !== -1) {
        if (known.lockedSlots[existingSlot]) return;
        playKeyClick(soundEnabled);
        setSlots((prev) => {
          pushHistory(prev);
          const next: SlotArray = [...prev] as SlotArray;
          next[existingSlot] = null;
          return next;
        });
        setDirtySlots((prev) => {
          const next = [...prev];
          next[existingSlot] = true;
          return next;
        });
        setActiveSlot(existingSlot);
        return;
      }

      let target = activeSlot;
      const isActiveStaleFeedback =
        !known.lockedSlots[target] && slots[target] !== null && !dirtySlots[target];

      if (known.lockedSlots[target] || (slots[target] !== null && !isActiveStaleFeedback)) {
        const emptyUnlocked = slots.findIndex((c, idx) => !known.lockedSlots[idx] && c === null);
        if (emptyUnlocked !== -1) {
          target = emptyUnlocked;
        } else {
          const staleUnlocked = slots.findIndex(
            (_c, idx) => !known.lockedSlots[idx] && !dirtySlots[idx],
          );
          if (staleUnlocked !== -1) {
            target = staleUnlocked;
          } else {
            const firstUnlocked = slots.findIndex((_c, idx) => !known.lockedSlots[idx]);
            target = firstUnlocked === -1 ? 0 : firstUnlocked;
          }
        }
      }

      placeCardInSlot(cardId, target);
    },
    [
      activeSlot,
      dirtySlots,
      isPlaying,
      known.lockedSlots,
      placeCardInSlot,
      pushHistory,
      slots,
      soundEnabled,
    ],
  );

  const handleClearSlot = useCallback(
    (slotIdx: number) => {
      if (!isPlaying || known.lockedSlots[slotIdx]) return;
      playKeyClick(soundEnabled);
      setSlots((prev) => {
        pushHistory(prev);
        const next: SlotArray = [...prev] as SlotArray;
        next[slotIdx] = null;
        return next;
      });
      setDirtySlots((prev) => {
        const next = [...prev];
        next[slotIdx] = true;
        return next;
      });
      setActiveSlot(slotIdx);
    },
    [isPlaying, known.lockedSlots, pushHistory, soundEnabled],
  );

  const handleUndo = useCallback(() => {
    if (!isPlaying || slotHistory.length === 0) return;
    playKeyClick(soundEnabled);
    const previous = slotHistory[slotHistory.length - 1]!;
    setSlotHistory((prev) => prev.slice(0, -1));
    setSlots(previous);
    setDirtySlots([
      !known.lockedSlots[0],
      !known.lockedSlots[1],
      !known.lockedSlots[2],
      !known.lockedSlots[3],
    ]);
    setActiveSlot(findFirstOpenUnlockedSlot(previous, known.lockedSlots));
  }, [isPlaying, known.lockedSlots, slotHistory, soundEnabled]);

  const handleClearUnlocked = useCallback(() => {
    if (!isPlaying) return;
    playKeyClick(soundEnabled);
    setSlots((prev) => {
      pushHistory(prev);
      const nextSlots: SlotArray = [
        known.lockedSlots[0] ?? null,
        known.lockedSlots[1] ?? null,
        known.lockedSlots[2] ?? null,
        known.lockedSlots[3] ?? null,
      ];
      setActiveSlot(findFirstOpenUnlockedSlot(nextSlots, known.lockedSlots));
      return nextSlots;
    });
    setDirtySlots([
      !known.lockedSlots[0],
      !known.lockedSlots[1],
      !known.lockedSlots[2],
      !known.lockedSlots[3],
    ]);
  }, [isPlaying, known.lockedSlots, pushHistory, soundEnabled]);

  const handleSubmitGuess = useCallback(async () => {
    if (!state || !isPlaying || submitting) return;
    if (slots.some((s) => s === null)) {
      setErrorMsg('Place 4 Bridge Posts into all 4 Thread Slots before forging.');
      return;
    }

    const cardIds = slots as [string, string, string, string];
    if (effectiveHardMode && state.progress.attempts.length > 0) {
      const ironError = validateIronForgeConstraints(state.progress.attempts, cardIds);
      if (ironError) {
        setErrorMsg(ironError);
        return;
      }
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const updated = state.communityMeta
        ? await postCommunityGuess({
            puzzleId: state.communityMeta.puzzleId,
            cardIds,
            elapsedSeconds: Math.max(1, elapsedSeconds),
            hardMode: effectiveHardMode,
          })
        : await postGuess({
            dateKey: state.activeDateKey,
            cardIds,
            elapsedSeconds: Math.max(1, elapsedSeconds),
            hardMode: effectiveHardMode,
          });
      syncFromState(updated, true);

      if (updated.communityMeta && updated.progress.status !== 'playing') {
        void loadCommunityQueue();
      }

      const newAttempt = updated.progress.attempts[updated.progress.attempts.length - 1];
      if (newAttempt) {
        playAttemptFeedback(
          soundEnabled,
          newAttempt.slots.map((s) => s.verdict),
        );
      }
      if (updated.progress.status === 'won') {
        playVictoryChord(soundEnabled);
        window.setTimeout(() => setResultModalOpen(true), 460);
      } else if (updated.progress.status === 'lost') {
        window.setTimeout(() => setResultModalOpen(true), 460);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to grade submission.');
    } finally {
      setSubmitting(false);
    }
  }, [
    effectiveHardMode,
    elapsedSeconds,
    isPlaying,
    loadCommunityQueue,
    slots,
    soundEnabled,
    state,
    submitting,
    syncFromState,
  ]);

  const handleRevealHint = useCallback(async () => {
    if (!state || !isPlaying) return;
    if (state.revealedHints.length >= state.puzzle.totalHints) return;
    setErrorMsg(null);
    try {
      const updated = state.communityMeta
        ? await postCommunityHint(state.communityMeta.puzzleId)
        : await postHint(state.activeDateKey);
      setState(updated);
      playKeyClick(soundEnabled);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not unlock hint.');
    }
  }, [isPlaying, soundEnabled, state]);

  // Keyboard Speedflow: 1-6 fill/toggle card, Enter submit, Z undo, H clue, ArrowUp/Down move slot cursor
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeTab !== 'daily' || !state || !isPlaying) return;
      if (resultModalOpen || leaderboardModalOpen || archiveModalOpen || helpModalOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === 'INPUT' &&
        !['checkbox', 'radio', 'button'].includes((target as HTMLInputElement).type);
      if (
        target &&
        (isTextInput ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key >= '1' && event.key <= '6') {
        const cardIdx = Number(event.key) - 1;
        const card = state.puzzle.cards[cardIdx];
        if (card) {
          event.preventDefault();
          handleTapBridgeCard(card.id);
        }
        return;
      }

      if (event.key === 'z' || event.key === 'Z' || event.key === 'Backspace') {
        if (slotHistory.length > 0) {
          event.preventDefault();
          handleUndo();
        }
        return;
      }

      if (event.key === 'h' || event.key === 'H') {
        if (state.revealedHints.length < state.puzzle.totalHints) {
          event.preventDefault();
          void handleRevealHint();
        }
        return;
      }

      if (event.key === 'Enter' && target?.tagName !== 'BUTTON') {
        if (slots.every(Boolean)) {
          event.preventDefault();
          void handleSubmitGuess();
        }
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        for (let step = 1; step <= SLOT_COUNT; step += 1) {
          const candidate = (activeSlot + delta * step + SLOT_COUNT) % SLOT_COUNT;
          if (!known.lockedSlots[candidate]) {
            event.preventDefault();
            setActiveSlot(candidate);
            break;
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeSlot,
    activeTab,
    archiveModalOpen,
    handleRevealHint,
    handleSubmitGuess,
    handleTapBridgeCard,
    handleUndo,
    helpModalOpen,
    isPlaying,
    known.lockedSlots,
    leaderboardModalOpen,
    resultModalOpen,
    slotHistory.length,
    slots,
    state,
  ]);

  const copyTextSafe = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Clipboard blocked in sandboxed iframe; fallback handled by caller.
    }
    return false;
  }, []);

  const handleShareComment = useCallback(async () => {
    if (!state || sharing) return;
    setSharing(true);
    setShareNotice(null);
    try {
      const res = state.communityMeta
        ? await postCommunityShare(state.communityMeta.puzzleId)
        : await postShareComment(state.activeDateKey);
      await copyTextSafe(res.markdown);
      setShareNotice(res.message);
      setState((prev) =>
        prev
          ? {
              ...prev,
              recentShares: res.recentShares,
              progress: { ...prev.progress, sharedToThread: true },
            }
          : prev,
      );
    } catch (err) {
      setShareNotice(err instanceof Error ? err.message : 'Unable to post comment right now.');
    } finally {
      setSharing(false);
    }
  }, [copyTextSafe, sharing, state]);

  const handleCopyOnly = useCallback(async () => {
    if (!state?.shareMarkdown) return;
    const copied = await copyTextSafe(state.shareMarkdown);
    setShareNotice(
      copied
        ? 'Spoiler-free markdown copied to clipboard.'
        : 'Select and copy the spoiler-free box above to share in any Reddit thread.',
    );
  }, [copyTextSafe, state?.shareMarkdown]);

  const handleOpenArchive = useCallback(async () => {
    setArchiveModalOpen(true);
    try {
      const archive = await fetchArchive();
      setArchiveEditions(archive.editions);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load archive.');
    }
  }, []);

  const handleOpenLeaderboard = useCallback(async () => {
    setLeaderboardModalOpen(true);
    if (!state) return;
    const seq = ++ranksSeqRef.current;
    const targetDate = state.communityMeta ? state.todayUtc : state.activeDateKey;
    setRanksSnapshot((prev) => (prev && prev.dateKey === targetDate ? prev : null));
    try {
      const data = await fetchLeaderboard(targetDate);
      if (seq !== ranksSeqRef.current) return;
      setRanksSnapshot(data);
      setState((prev) =>
        prev
          ? {
              ...prev,
              stats: prev.communityMeta ? prev.stats : data.stats,
              leaderboard: data.leaderboard,
              ironForgeLeaderboard: data.ironForgeLeaderboard,
              topForgers: data.topForgers,
              recentShares: data.recentShares,
            }
          : prev,
      );
    } catch {
      // Keep existing leaderboard snapshot if refresh fails.
    }
  }, [state]);

  const handleCreateCommunityPuzzle = useCallback(
    async (draft: CommunityForgeDraftInput) => {
      const seq = ++communitySeqRef.current;
      const res = await postCommunityPuzzle(draft);
      if (seq === communitySeqRef.current) {
        setCommunityQueue(res.queue);
      }
      playVictoryChord(soundEnabled);
    },
    [soundEnabled],
  );

  const handleVoteCommunityPuzzle = useCallback(
    async (puzzleId: string) => {
      const seq = ++communitySeqRef.current;
      const res = await postCommunityVote(puzzleId);
      if (seq === communitySeqRef.current) {
        setCommunityQueue(res.queue);
      }
      playKeyClick(soundEnabled);
    },
    [soundEnabled],
  );

  // Drag-and-Drop handlers
  const onCardDragStart = (cardId: string, fromSlot: number | null) => (e: DragEvent) => {
    if (!isPlaying) return;
    dragCardRef.current = { cardId, fromSlot };
    setDraggingCardId(cardId);
    e.dataTransfer.setData('text/plain', cardId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onCardDragEnd = () => {
    dragCardRef.current = null;
    setDraggingCardId(null);
    setDragOverSlot(null);
  };

  const onSlotDragOver = (slotIdx: number) => (e: DragEvent) => {
    if (!isPlaying || known.lockedSlots[slotIdx]) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSlot !== slotIdx) {
      setDragOverSlot(slotIdx);
    }
  };

  const onSlotDrop = (slotIdx: number) => (e: DragEvent) => {
    e.preventDefault();
    setDragOverSlot(null);
    setDraggingCardId(null);
    if (!isPlaying || known.lockedSlots[slotIdx]) return;
    const droppedId = dragCardRef.current?.cardId ?? e.dataTransfer.getData('text/plain');
    dragCardRef.current = null;
    if (droppedId && cardById.has(droppedId)) {
      placeCardInSlot(droppedId, slotIdx);
    }
  };

  if (loading && !state) {
    return (
      <main className="kf-shell">
        <div className="kf-panel kf-loading-card">
          <h1 className="kf-brand-name">KarmaForge</h1>
          <p className="kf-muted-copy">Booting dark-terminal daily thread engine…</p>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="kf-shell">
        <div className="kf-banner kf-banner--error">
          <span>{errorMsg ?? 'Could not connect to KarmaForge server.'}</span>
          <button type="button" className="kf-nav-btn" onClick={() => void loadDate()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  const { puzzle, progress, streak, revealedHints } = state;
  const filledCount = slots.filter(Boolean).length;
  const hasUnlockedFilled = slots.some((cardId, idx) => cardId !== null && !known.lockedSlots[idx]);
  const allFilled = filledCount === SLOT_COUNT;
  const showMicroGuide = shouldShowMicroGuide({
    dismissed: guideDismissed,
    isPlaying: Boolean(isPlaying),
    activeTab,
    attemptsCount: progress.attempts.length,
    placedCount: filledCount,
  });

  return (
    <main className="kf-shell" data-testid="karmaforge-app">
      {/* Dark Terminal Geek Masthead */}
      <header className="kf-masthead">
        <div className="kf-brand-group">
          <KarmaForgeMark />
          <div className="kf-brand-titles">
            <div className="kf-brand-row">
              <h1 className="kf-brand-name">KarmaForge</h1>
              <span className="kf-edition-stamp tabular">
                {state.communityMeta ? 'UGC' : `#${padIssueNumber(puzzle.issueNumber)}`}
              </span>
            </div>
            <span className="kf-brand-sub">{state.username}</span>
          </div>
        </div>

        <nav className="kf-mode-tabs" role="tablist" aria-label="KarmaForge workspaces">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'daily' && !state.communityMeta}
            data-testid="tab-daily"
            className={
              activeTab === 'daily' && !state.communityMeta
                ? 'kf-tab-btn kf-tab-btn--active'
                : 'kf-tab-btn'
            }
            onClick={() => {
              if (state.communityMeta) {
                void loadDate(state.todayUtc);
              } else {
                setActiveTab('daily');
              }
            }}
          >
            <TerminalIcon />
            <span>Daily Forge</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'community' || Boolean(state.communityMeta)}
            data-testid="tab-community"
            className={
              activeTab === 'community' || Boolean(state.communityMeta)
                ? 'kf-tab-btn kf-tab-btn--active'
                : 'kf-tab-btn'
            }
            onClick={() => {
              setActiveTab('community');
              void loadCommunityQueue();
            }}
          >
            <AnvilIcon />
            <span>Community Forge</span>
            <span className="kf-tab-count tabular">{communityQueue?.totalSubmissions ?? 3}</span>
          </button>
        </nav>

        <div className="kf-masthead-actions">
          <span
            className="kf-streak-pill tabular"
            data-testid="streak-pill"
            title={streak.flair.flavor}
          >
            <img
              src={streak.flair.artPath}
              alt=""
              aria-hidden="true"
              className="kf-streak-thumb"
              width={18}
              height={18}
            />
            <FlameIcon />
            <span>{streak.currentStreak}d</span>
            <span className="kf-streak-flair">{streak.flair.title}</span>
          </span>

          <button
            type="button"
            className="kf-nav-btn"
            data-testid="open-leaderboard-btn"
            onClick={() => void handleOpenLeaderboard()}
          >
            <TrophyIcon />
            <span>Ranks</span>
          </button>

          <button
            type="button"
            className="kf-nav-btn"
            data-testid="open-archive-btn"
            onClick={() => void handleOpenArchive()}
          >
            <ArchiveIcon />
            <span>Archive</span>
          </button>

          <button
            type="button"
            className="kf-nav-btn"
            data-testid="open-help-btn"
            aria-label="How to play and keyboard shortcuts"
            onClick={() => setHelpModalOpen(true)}
          >
            ?
          </button>

          <button
            type="button"
            className="kf-nav-btn"
            data-testid="toggle-sound-btn"
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
            onClick={() => {
              const nextEnabled = !soundEnabled;
              setSoundEnabled(nextEnabled);
              if (nextEnabled) {
                playToggleChime(true);
              }
            }}
          >
            <SoundIcon muted={!soundEnabled} />
          </button>
        </div>
      </header>

      {activeTab === 'community' ? (
        <CommunityForge
          queue={communityQueue}
          loading={communityLoading}
          username={state.username}
          onRefresh={loadCommunityQueue}
          onCreate={handleCreateCommunityPuzzle}
          onVote={handleVoteCommunityPuzzle}
          onPlay={loadCommunityPuzzle}
        />
      ) : (
        <>
          {/* Daily / Community Terminal Telemetry Bar */}
          <section
            className={
              effectiveHardMode ? 'kf-edition-bar kf-edition-bar--iron' : 'kf-edition-bar'
            }
            aria-label={state.communityMeta ? 'Active community puzzle' : 'Active daily puzzle'}
          >
            <div className="kf-edition-headline-wrap">
              <h2 className="kf-edition-title" data-testid="puzzle-title">
                {puzzle.title}
              </h2>
              {state.communityMeta && (
                <span className="kf-community-banner-chip" data-testid="community-play-badge">
                  UGC · by {state.communityMeta.authorUsername}
                </span>
              )}
              <span className="kf-meta-tag">{puzzle.category}</span>
              <span className="kf-meta-tag">{puzzle.difficulty}</span>
            </div>
            <div className="kf-edition-right tabular">
              <label
                className={[
                  'kf-iron-switch',
                  effectiveHardMode ? 'kf-iron-switch--on' : '',
                  isHardModeLocked ? 'kf-iron-switch--locked' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-testid="iron-forge-toggle"
                title={
                  isHardModeLocked
                    ? effectiveHardMode
                      ? 'Iron Forge active (3 tries, strict clues, +25% Karma)'
                      : 'Standard mode locked after Attempt 1'
                    : 'Iron Forge Hard Mode: 3 tries max, strict clue rules, +25% Karma & gold comment crest'
                }
              >
                <input
                  type="checkbox"
                  role="switch"
                  {...({ switch: '' } as Record<string, string>)}
                  className="kf-iron-input"
                  data-testid="iron-forge-checkbox"
                  checked={effectiveHardMode}
                  disabled={isHardModeLocked}
                  aria-label="Iron Forge hard mode (3 attempts, strict clues)"
                  onChange={handleToggleIronForge}
                />
                <AnvilIcon />
                <span className="kf-iron-label">Iron Forge</span>
              </label>
              <span
                className="kf-combo-pill"
                data-testid="speed-combo-pill"
                title="Live speed and streak multiplier"
              >
                <BoltIcon />
                <span>{liveCombo.multiplier.toFixed(2)}x</span>
                <span className="kf-combo-tier">{liveCombo.tierLabel}</span>
              </span>
              <span className="kf-timer-chip kf-mono">
                <ClockIcon />
                <span>{formatDurationCompact(elapsedSeconds || 1)}</span>
              </span>
              {state.communityMeta ? (
                <>
                  <span className="kf-date-chip kf-mono tabular">
                    {state.communityMeta.clears}/{state.communityMeta.plays} clears
                  </span>
                  <button
                    type="button"
                    className="kf-back-today-btn"
                    data-testid="back-to-daily-btn"
                    onClick={() => void loadDate(state.todayUtc)}
                  >
                    Back to Daily
                  </button>
                </>
              ) : (
                <>
                  <span className="kf-date-chip kf-mono">{state.activeDateKey} UTC</span>
                  {!state.isToday && (
                    <button
                      type="button"
                      className="kf-back-today-btn"
                      onClick={() => void loadDate(state.todayUtc)}
                    >
                      Today
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          {errorMsg && (
            <div role="alert" className="kf-banner kf-banner--error">
              <span>{errorMsg}</span>
              <button type="button" className="kf-nav-btn" onClick={() => setErrorMsg(null)}>
                Dismiss
              </button>
            </div>
          )}

          {feedbackBanner && (
            <div
              role="status"
              data-testid="feedback-banner"
              className={`kf-banner ${
                progress.status === 'won' ? 'kf-banner--won' : 'kf-banner--feedback'
              }`}
            >
              <span>{feedbackBanner}</span>
              {progress.status !== 'playing' && (
                <button
                  type="button"
                  className="kf-nav-btn"
                  onClick={() => setResultModalOpen(true)}
                >
                  Share Card
                </button>
              )}
            </div>
          )}

          {/* Two-Column Dark Terminal Workspace */}
          <div className="kf-workspace">
            {/* Left Column: Opening Post -> 4 Thread Slots -> Finale Post */}
            <section className="kf-thread-col" aria-label="Subreddit thread chain">
              {/* Opening Post */}
              <article className="kf-anchor-card" data-testid="opening-post">
                <h3 className="kf-anchor-title">{puzzle.openingPost.title}</h3>
                <div className="kf-anchor-meta">
                  <div className="kf-anchor-left">
                    <span className="kf-role-badge">Opening Post</span>
                    <span className="kf-sub-text">{puzzle.openingPost.subreddit}</span>
                    <span className="kf-flair-chip">{puzzle.openingPost.flair}</span>
                  </div>
                  <span className="kf-upvote-chip tabular">▲ {puzzle.openingPost.upvotes}</span>
                </div>
                <p className="kf-anchor-excerpt">{puzzle.openingPost.excerpt}</p>
              </article>

              {/* Connected 4 Thread Link Slots */}
              <div className="kf-spine-section" role="list" aria-label="4 Thread Bridge Slots">
                {slots.map((cardId, idx) => {
                  const card = cardId ? cardById.get(cardId) : undefined;
                  const verdict = getDisplayedVerdict(idx, cardId);
                  const isLocked = Boolean(known.lockedSlots[idx]);
                  const isTarget = isPlaying && !isLocked && activeSlot === idx;
                  const isDragTarget = dragOverSlot === idx;
                  const isDragging = Boolean(card && draggingCardId === card.id);

                  const slotClasses = [
                    'kf-slot',
                    card ? 'kf-slot--filled' : '',
                    isTarget ? 'kf-slot--active' : '',
                    showMicroGuide && idx === 0 ? 'kf-slot--guided' : '',
                    isDragTarget ? 'kf-slot--dragover' : '',
                    isDragging ? 'kf-dragging' : '',
                    verdict ? `kf-slot--${verdict}` : '',
                    verdict && revealPulse > 0 ? 'kf-slot--reveal' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <div
                      key={`${idx}-${revealPulse}`}
                      role="listitem"
                      data-testid={`thread-slot-${idx}`}
                      data-verdict={verdict ?? 'empty'}
                      className={slotClasses}
                      style={verdict ? { animationDelay: `${idx * 75}ms` } : undefined}
                      draggable={Boolean(card && isPlaying && !isLocked)}
                      onDragStart={card && !isLocked ? onCardDragStart(card.id, idx) : undefined}
                      onDragEnd={onCardDragEnd}
                      onDragOver={onSlotDragOver(idx)}
                      onDragLeave={() => setDragOverSlot(null)}
                      onDrop={onSlotDrop(idx)}
                    >
                      <span className="kf-slot-num tabular" aria-hidden="true">
                        {verdict === 'exact' ? '✓' : idx + 1}
                      </span>

                      {verdict === 'exact' && revealPulse > 0 && (
                        <span className="kf-forge-sparks" aria-hidden="true">
                          <span className="kf-spark kf-spark--1" />
                          <span className="kf-spark kf-spark--2" />
                          <span className="kf-spark kf-spark--3" />
                          <span className="kf-spark kf-spark--4" />
                          <span className="kf-spark kf-spark--5" />
                          <span className="kf-spark kf-spark--6" />
                        </span>
                      )}

                      <button
                        type="button"
                        className="kf-slot-body"
                        disabled={!isPlaying || isLocked}
                        onClick={() => {
                          if (!isPlaying || isLocked) return;
                          if (card && verdict && verdict !== 'exact') {
                            handleClearSlot(idx);
                          } else {
                            setActiveSlot(idx);
                          }
                        }}
                      >
                        {card ? (
                          <>
                            <div className="kf-slot-card-top">
                              <span className="kf-slot-card-sub">{card.subreddit}</span>
                              {verdict === 'exact' && (
                                <span className="kf-verdict-pill kf-verdict-pill--exact">
                                  Exact Lock
                                </span>
                              )}
                              {verdict === 'misplaced' && (
                                <span className="kf-verdict-pill kf-verdict-pill--misplaced">
                                  Wrong Order
                                </span>
                              )}
                              {verdict === 'wrong' && (
                                <span className="kf-verdict-pill kf-verdict-pill--wrong">
                                  Off-Topic Troll
                                </span>
                              )}
                            </div>
                            <div className="kf-slot-card-title">{card.title}</div>
                          </>
                        ) : (
                          <span className="kf-slot-empty-text">
                            {isTarget
                              ? `Slot #${idx + 1} armed · keys 1–6`
                              : `Slot #${idx + 1} empty`}
                          </span>
                        )}
                      </button>

                      {card && isPlaying && !isLocked && (
                        <div className="kf-slot-controls">
                          <span className="kf-drag-grip" aria-hidden="true" title="Drag to reorder">
                            <DragHandleIcon />
                          </span>
                          <button
                            type="button"
                            className="kf-slot-move"
                            aria-label={`Move Link ${idx + 1} up`}
                            disabled={idx === 0}
                            onClick={() => handleSwapAdjacentSlot(idx, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="kf-slot-move"
                            aria-label={`Move Link ${idx + 1} down`}
                            disabled={idx === SLOT_COUNT - 1}
                            onClick={() => handleSwapAdjacentSlot(idx, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="kf-slot-remove"
                            aria-label={`Remove card from Link ${idx + 1}`}
                            onClick={() => handleClearSlot(idx)}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Finale Post */}
              <article className="kf-anchor-card kf-anchor-card--finale" data-testid="finale-post">
                <h3 className="kf-anchor-title">{puzzle.finalePost.title}</h3>
                <div className="kf-anchor-meta">
                  <div className="kf-anchor-left">
                    <span className="kf-role-badge kf-role-badge--finale">Finale Post</span>
                    <span className="kf-sub-text">{puzzle.finalePost.subreddit}</span>
                    <span className="kf-flair-chip">{puzzle.finalePost.flair}</span>
                  </div>
                  <span className="kf-upvote-chip tabular">▲ {puzzle.finalePost.upvotes}</span>
                </div>
                <p className="kf-anchor-excerpt">{puzzle.finalePost.excerpt}</p>
              </article>

              {/* Primary Action & Attempts Strip */}
              <div className="kf-action-bar">
                <div className="kf-attempts-meter">
                  <span
                    className={
                      effectiveHardMode
                        ? 'kf-attempts-label kf-attempts-label--iron tabular'
                        : 'kf-attempts-label tabular'
                    }
                    data-testid="attempts-label"
                  >
                    {progress.status === 'playing'
                      ? `${effectiveHardMode ? 'Iron Forge' : 'Attempts'} ${progress.attempts.length}/${activeMaxAttempts}`
                      : progress.status === 'won'
                        ? `Forged ${progress.attempts.length}/${activeMaxAttempts}`
                        : `Locked ${activeMaxAttempts}/${activeMaxAttempts}`}
                  </span>
                  <span className="kf-pips" aria-hidden="true">
                    {Array.from({ length: activeMaxAttempts }).map((_, idx) => {
                      const att = progress.attempts[idx];
                      let cls = effectiveHardMode ? 'kf-pip kf-pip--iron' : 'kf-pip';
                      if (att) {
                        cls +=
                          att.exactCount === SLOT_COUNT
                            ? ' kf-pip--won'
                            : progress.status === 'lost' && idx === activeMaxAttempts - 1
                              ? ' kf-pip--lost'
                              : ' kf-pip--used';
                      }
                      return <span key={idx} className={cls} />;
                    })}
                  </span>
                </div>

                <div className="kf-action-btns">
                  {isPlaying ? (
                    <>
                      <button
                        type="button"
                        className="kf-btn-secondary"
                        data-testid="undo-btn"
                        disabled={slotHistory.length === 0 || submitting}
                        onClick={handleUndo}
                        title="Undo last placement (Z)"
                      >
                        <UndoIcon />
                        <span>Undo</span>
                      </button>
                      <button
                        type="button"
                        className="kf-btn-secondary"
                        data-testid="clear-unlocked-btn"
                        disabled={!hasUnlockedFilled || submitting}
                        onClick={handleClearUnlocked}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className="kf-btn-primary tabular"
                        data-testid="forge-submit-btn"
                        disabled={!allFilled || submitting}
                        onClick={() => void handleSubmitGuess()}
                      >
                        {submitting ? 'Grading…' : `Forge (${filledCount}/${SLOT_COUNT})`}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="kf-btn-primary kf-btn-emerald"
                      data-testid="open-debrief-btn"
                      onClick={() => setResultModalOpen(true)}
                    >
                      Debrief &amp; Share Grid
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Right Column: Candidate Bridge Deck + Hints + Pixel Badge Wall */}
            <aside className="kf-deck-col" aria-label="Bridge deck, clues, and badges">
              <section className="kf-panel">
                <div className="kf-panel-head">
                  <h2 className="kf-panel-title">Bridge Deck</h2>
                  <span className="kf-panel-sub">
                    {effectiveHardMode ? 'Iron · Strict Clues' : '4 Links, 2 Trolls'}
                  </span>
                </div>

                {showMicroGuide && (
                  <div className="kf-micro-guide" data-testid="micro-guide-cue" role="note">
                    <span className="kf-micro-guide-dot" aria-hidden="true" />
                    <span className="kf-micro-guide-text">Tap card or press 1-6 to link</span>
                    <button
                      type="button"
                      className="kf-micro-guide-close"
                      aria-label="Dismiss quick tip"
                      onClick={dismissMicroGuide}
                    >
                      ×
                    </button>
                  </div>
                )}

                <div className="kf-deck-list" data-testid="bridge-deck">
                  {puzzle.cards.map((card, cardIdx) => {
                    const placedIndex = slots.indexOf(card.id);
                    const isPlaced = placedIndex !== -1;
                    const isLockedCard = isPlaced && Boolean(known.lockedSlots[placedIndex]);
                    const isKnownWrong = known.knownWrongIds.has(card.id);
                    const isIronBanned = effectiveHardMode && isKnownWrong && !isPlaced;
                    const badSlots = known.misplacedSlotsByCard[card.id] ?? [];
                    const isDragging = draggingCardId === card.id;
                    const isGuidedCard = showMicroGuide && cardIdx === 0;

                    const cardClasses = [
                      'kf-bridge-card',
                      isGuidedCard ? 'kf-bridge-card--guided' : '',
                      isPlaced ? 'kf-bridge-card--placed' : '',
                      isKnownWrong ? 'kf-bridge-card--known-wrong' : '',
                      !isKnownWrong && badSlots.length > 0 ? 'kf-bridge-card--known-misplaced' : '',
                      isDragging ? 'kf-dragging' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <button
                        key={card.id}
                        type="button"
                        data-testid={`bridge-card-${card.id}`}
                        data-card-id={card.id}
                        data-guided={isGuidedCard ? 'true' : undefined}
                        className={cardClasses}
                        disabled={!isPlaying || isLockedCard || isIronBanned}
                        draggable={Boolean(isPlaying && !isLockedCard && !isIronBanned)}
                        onDragStart={onCardDragStart(card.id, isPlaced ? placedIndex : null)}
                        onDragEnd={onCardDragEnd}
                        onClick={() => handleTapBridgeCard(card.id)}
                      >
                        <div className="kf-bridge-top">
                          <div className="kf-bridge-meta">
                            <kbd className="kf-kbd tabular" aria-hidden="true">
                              {cardIdx + 1}
                            </kbd>
                            <span className="kf-bridge-sub">{card.subreddit}</span>
                            <span className="kf-bridge-tag">{card.tag}</span>
                          </div>
                          {isPlaced && isKnownWrong ? (
                            <span className="kf-bridge-status kf-bridge-status--wrong tabular">
                              Troll · #{placedIndex + 1}
                            </span>
                          ) : isPlaced ? (
                            <span className="kf-bridge-status kf-bridge-status--placed tabular">
                              {isLockedCard ? `Locked #${placedIndex + 1}` : `Slot #${placedIndex + 1}`}
                            </span>
                          ) : isKnownWrong ? (
                            <span className="kf-bridge-status kf-bridge-status--wrong">
                              {effectiveHardMode ? 'Banned Troll' : 'Red Herring'}
                            </span>
                          ) : badSlots.length > 0 ? (
                            <span className="kf-bridge-status kf-bridge-status--misplaced tabular">
                              Not {badSlots.map((s) => `#${s + 1}`).join(', ')}
                            </span>
                          ) : null}
                        </div>
                        <span className="kf-bridge-title">{card.title}</span>
                        <span className="kf-bridge-summary">{card.summary}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="kf-shortcut-strip" aria-label="Keyboard shortcuts">
                  <span>
                    <kbd className="kf-kbd">1-6</kbd> Slot
                  </span>
                  <span>
                    <kbd className="kf-kbd">Enter</kbd> Forge
                  </span>
                  <span>
                    <kbd className="kf-kbd">Z</kbd> Undo
                  </span>
                  <span>
                    <kbd className="kf-kbd">H</kbd> Clue
                  </span>
                </div>
              </section>

              {/* Attempt History & Top Comment Hints */}
              <section className="kf-panel">
                <div className="kf-panel-head">
                  <h2 className="kf-panel-title">Top Comment Clues</h2>
                  <span className="kf-panel-sub tabular">
                    {revealedHints.length}/{puzzle.totalHints} Clues
                  </span>
                </div>

                {progress.attempts.length > 0 && (
                  <div className="kf-history-strip" data-testid="attempt-history-strip">
                    {progress.attempts.map((att) => (
                      <span key={att.attemptNumber} className="kf-history-chip tabular">
                        <span>#{att.attemptNumber}</span>
                        <span className="kf-mini-tiles" aria-label={`Attempt ${att.attemptNumber}`}>
                          {att.slots.map((slot, sIdx) => (
                            <span
                              key={sIdx}
                              className={`kf-mini-tile kf-mini-tile--${slot.verdict}`}
                            />
                          ))}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {revealedHints.map((hint, idx) => (
                  <div key={idx} className="kf-hint-card" data-testid={`hint-card-${idx}`}>
                    <div className="kf-hint-meta">
                      <span>{hint.author} · Top Comment</span>
                      <span className="tabular">▲ {hint.upvotes}</span>
                    </div>
                    <p className="kf-hint-text">{hint.text}</p>
                  </div>
                ))}

                {isPlaying && revealedHints.length < puzzle.totalHints && (
                  <button
                    type="button"
                    className="kf-hint-btn"
                    data-testid="reveal-hint-btn"
                    onClick={() => void handleRevealHint()}
                  >
                    <ClueIcon />
                    <span>
                      Reveal Clue ({revealedHints.length}/{puzzle.totalHints})
                    </span>
                  </button>
                )}

                {revealedHints.length === 0 && !isPlaying && (
                  <p className="kf-muted-copy">Zero clues used: pure Reddit thread intuition.</p>
                )}
              </section>

              {/* Pixel Achievement Badge Wall */}
              <section className="kf-panel" aria-label="Pixel achievement badges">
                <div className="kf-panel-head">
                  <h2 className="kf-panel-title">Pixel Badge Wall</h2>
                  <span className="kf-panel-sub tabular">Best {streak.bestStreak}d</span>
                </div>
                <BadgeVault
                  currentStreak={streak.currentStreak}
                  bestStreak={streak.bestStreak}
                  compact
                />
              </section>
            </aside>
          </div>
        </>
      )}

      {/* Native <dialog closedby="any"> Modals */}
      <ResultModal
        open={resultModalOpen}
        onClose={() => setResultModalOpen(false)}
        state={state}
        countdownSeconds={countdownSeconds}
        sharing={sharing}
        shareNotice={shareNotice}
        onShareComment={() => void handleShareComment()}
        onCopyOnly={() => void handleCopyOnly()}
        onOpenLeaderboard={() => {
          setResultModalOpen(false);
          void handleOpenLeaderboard();
        }}
        onOpenArchive={() => {
          setResultModalOpen(false);
          void handleOpenArchive();
        }}
        onOpenCommunityForge={() => {
          setResultModalOpen(false);
          setActiveTab('community');
          void loadCommunityQueue();
        }}
        onBackToDaily={() => {
          setResultModalOpen(false);
          void loadDate(state.todayUtc);
        }}
      />

      <LeaderboardModal
        open={leaderboardModalOpen}
        onClose={() => setLeaderboardModalOpen(false)}
        issueNumber={
          state.communityMeta
            ? getIssueNumberForDate(ranksSnapshot?.dateKey ?? state.todayUtc)
            : puzzle.issueNumber
        }
        dateKey={ranksSnapshot?.dateKey ?? (state.communityMeta ? state.todayUtc : state.activeDateKey)}
        subredditName={state.subredditName}
        stats={ranksSnapshot?.stats ?? state.stats}
        leaderboard={ranksSnapshot?.leaderboard ?? state.leaderboard}
        ironForgeLeaderboard={
          ranksSnapshot?.ironForgeLeaderboard ?? state.ironForgeLeaderboard ?? []
        }
        topForgers={ranksSnapshot?.topForgers ?? state.topForgers ?? []}
        recentShares={ranksSnapshot?.recentShares ?? state.recentShares}
        currentUsername={state.username}
      />

      <ArchiveModal
        open={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        editions={archiveEditions}
        activeDateKey={state.activeDateKey}
        todayUtc={state.todayUtc}
        onSelectDate={(dateKey) => void loadDate(dateKey)}
      />

      <HelpModal
        open={helpModalOpen}
        onClose={() => setHelpModalOpen(false)}
        currentStreak={streak.currentStreak}
        bestStreak={streak.bestStreak}
      />
    </main>
  );
}
