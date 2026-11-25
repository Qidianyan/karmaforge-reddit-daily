import type { FlairTier, PlayerStreak } from './types.js';

export interface CollectibleBadgeItem {
  id: 'lurker' | 'weaver' | 'sage';
  title: string;
  minDays: number;
  artPath: string;
  caption: string;
}

export const COLLECTIBLE_BADGES: readonly CollectibleBadgeItem[] = [
  {
    id: 'lurker',
    title: 'Lurker',
    minDays: 1,
    artPath: './art/badge_lurker.png',
    caption: 'Day 1 streak · Night-shift observer',
  },
  {
    id: 'weaver',
    title: 'Thread Weaver',
    minDays: 7,
    artPath: './art/badge_weaver.png',
    caption: 'Day 7 streak · Chain architect',
  },
  {
    id: 'sage',
    title: 'Front Page Sage',
    minDays: 30,
    artPath: './art/badge_sage.png',
    caption: 'Day 30 streak · Certified lore master',
  },
] as const;

export const PRE_STREAK_FLAIR: FlairTier = {
  minDays: 0,
  title: 'Fresh Account',
  badge: '0d',
  flavor: 'Forge your first daily thread to unlock your Lurker pixel badge.',
  artPath: './art/badge_lurker.png',
};

export const FLAIR_TIERS: readonly FlairTier[] = [
  {
    minDays: 1,
    title: 'Lurker',
    badge: '1d+',
    flavor: 'Quietly lurking in the comments and nailing the daily thread.',
    artPath: './art/badge_lurker.png',
  },
  {
    minDays: 3,
    title: 'Commenter',
    badge: '3d+',
    flavor: 'Regular contributor spotted on three straight front-page puzzles.',
    artPath: './art/badge_lurker.png',
  },
  {
    minDays: 7,
    title: 'Thread Weaver',
    badge: '7d+',
    flavor: 'Full week of unbroken chains, spotting trolls from a mile away.',
    artPath: './art/badge_weaver.png',
  },
  {
    minDays: 14,
    title: 'Mod Favorite',
    badge: '14d+',
    flavor: 'Two weeks spotless. Automod nods respectfully as you pass.',
    artPath: './art/badge_weaver.png',
  },
  {
    minDays: 30,
    title: 'Front Page Sage',
    badge: '30d+',
    flavor: 'Legendary thirty-day streak. Certified architect of Reddit lore.',
    artPath: './art/badge_sage.png',
  },
] as const;

export function getFlairForStreak(streakDays: number): FlairTier {
  if (streakDays <= 0) {
    return PRE_STREAK_FLAIR;
  }
  let matched = FLAIR_TIERS[0]!;
  for (const tier of FLAIR_TIERS) {
    if (streakDays >= tier.minDays) {
      matched = tier;
    }
  }
  return matched;
}

export function getNextFlairTier(streakDays: number): FlairTier | null {
  for (const tier of FLAIR_TIERS) {
    if (streakDays < tier.minDays) {
      return tier;
    }
  }
  return null;
}

export function buildPlayerStreak(params: {
  currentStreak: number;
  bestStreak: number;
  totalSolved: number;
  lastSolvedDate: string | null;
}): PlayerStreak {
  return {
    ...params,
    flair: getFlairForStreak(params.currentStreak),
    nextFlair: getNextFlairTier(params.currentStreak),
  };
}
