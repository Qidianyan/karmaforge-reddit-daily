import { addUtcDays } from './daily.js';
import type {
  BridgeCard,
  CommunityForgeCardInput,
  CommunityForgeDraftInput,
  CommunityForgeValidationResult,
  CommunityPuzzleSubmission,
  PuzzleCategory,
  PuzzleDefinition,
  PuzzleDifficulty,
} from './types.js';

export const CREATOR_CLEAR_KARMA_BONUS = 50;
export const CREATOR_VOTE_KARMA_WEIGHT = 10;

/**
 * Converts a Community Forge UGC submission into a full playable PuzzleDefinition
 * compatible with KarmaForge's grading engine, Iron Forge rules, and 1-6 speedflow board.
 */
export function communitySubmissionToPuzzleDefinition(
  sub: CommunityPuzzleSubmission,
): PuzzleDefinition {
  const linkCards: BridgeCard[] = sub.links.map((lnk, idx) => ({
    id: `${sub.id}-l${idx + 1}`,
    subreddit: normalizeSubredditName(lnk.subreddit || sub.subreddit),
    tag: cleanText(lnk.tag || `Link ${idx + 1}`, 22) || `Link ${idx + 1}`,
    title: cleanText(lnk.title, 96),
    summary: cleanText(lnk.summary || lnk.title, 140),
    isRedHerring: false,
    debrief: `Link ${idx + 1}: ${cleanText(lnk.summary || lnk.title, 140)}`,
  }));

  const trollCards: BridgeCard[] = sub.trolls.map((troll, idx) => ({
    id: `${sub.id}-t${idx + 1}`,
    subreddit: normalizeSubredditName(troll.subreddit || sub.subreddit),
    tag: cleanText(troll.tag || 'Red Herring', 22) || 'Red Herring',
    title: cleanText(troll.title, 96),
    summary: cleanText(troll.summary || troll.title, 140),
    isRedHerring: true,
    debrief: `Red Herring: ${cleanText(troll.summary || troll.title, 140)}`,
  }));

  const solutionIds: [string, string, string, string] = [
    linkCards[0]!.id,
    linkCards[1]!.id,
    linkCards[2]!.id,
    linkCards[3]!.id,
  ];

  const firstLink = linkCards[0]!;
  const safeAuthor = sub.authorUsername.startsWith('u/')
    ? sub.authorUsername
    : `u/${sub.authorUsername}`;

  return {
    id: sub.id,
    number: 0,
    category: sub.category,
    subreddit: normalizeSubredditName(sub.subreddit),
    title: sub.title,
    difficulty: sub.difficulty,
    openingPost: sub.openingPost,
    finalePost: sub.finalePost,
    solutionIds,
    cards: [
      linkCards[0]!,
      linkCards[1]!,
      linkCards[2]!,
      linkCards[3]!,
      trollCards[0]!,
      trollCards[1]!,
    ],
    hints: [
      {
        author: safeAuthor,
        upvotes: String(Math.max(1, sub.votes)),
        text:
          sub.hintText ||
          'Follow the causal handoff from the Opening Post rather than surface keywords.',
      },
      {
        author: 'u/KarmaForgeBot',
        upvotes: '128',
        text: `Anchor Link #1 with the ${firstLink.subreddit} (${firstLink.tag}) step and build toward ${sub.finalePost.subreddit}.`,
      },
    ],
  };
}

export const COMMUNITY_CATEGORIES: readonly PuzzleCategory[] = [
  'Science',
  'Retro Tech',
  'Cooking',
  'Cinema',
  'Worldbuilding',
  'Nature',
  'History',
  'Internet Culture',
] as const;

export const COMMUNITY_DIFFICULTIES: readonly PuzzleDifficulty[] = [
  'Mild',
  'Spicy',
  'Galaxy Brain',
] as const;

export function getTomorrowUtcDateKey(todayUtc: string): string {
  return addUtcDays(todayUtc, 1);
}

export function normalizeSubredditName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^\/?r\//i, '')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 24);
  return cleaned.length > 0 ? `r/${cleaned}` : 'r/KarmaForgeDaily';
}

function cleanText(raw: string, maxLen: number): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function isValidCategory(value: string): value is PuzzleCategory {
  return (COMMUNITY_CATEGORIES as readonly string[]).includes(value);
}

function isValidDifficulty(value: string): value is PuzzleDifficulty {
  return (COMMUNITY_DIFFICULTIES as readonly string[]).includes(value);
}

/**
 * Validates a community-authored 4-Link + 2-Troll Reddit thread puzzle in real time
 * (used identically by client composer and server POST /api/community/puzzles).
 */
export function validateCommunityPuzzleDraft(
  draft: CommunityForgeDraftInput,
): CommunityForgeValidationResult {
  const errors: string[] = [];
  const fieldErrors: Record<string, string> = {};

  const title = cleanText(draft.title ?? '', 84);
  const openingTitle = cleanText(draft.openingTitle ?? '', 120);
  const finaleTitle = cleanText(draft.finaleTitle ?? '', 120);
  const hintText = cleanText(draft.hintText ?? '', 180);

  let checksPassed = 0;
  const totalChecks = 10;

  if (title.length < 6) {
    fieldErrors.title = 'Enter a puzzle title (at least 6 characters).';
    errors.push(fieldErrors.title);
  } else {
    checksPassed += 1;
  }

  if (!isValidCategory(draft.category)) {
    fieldErrors.category = 'Choose one of the 8 subreddit categories.';
    errors.push(fieldErrors.category);
  } else {
    checksPassed += 1;
  }

  if (openingTitle.length < 10) {
    fieldErrors.openingTitle = 'Opening Post needs at least 10 characters.';
    errors.push(fieldErrors.openingTitle);
  } else {
    checksPassed += 1;
  }

  if (finaleTitle.length < 10) {
    fieldErrors.finaleTitle = 'Finale Post needs at least 10 characters.';
    errors.push(fieldErrors.finaleTitle);
  } else {
    checksPassed += 1;
  }

  const links = Array.isArray(draft.links) ? draft.links : [];
  const trolls = Array.isArray(draft.trolls) ? draft.trolls : [];
  const seenTitles = new Set<string>();

  if (links.length !== 4) {
    fieldErrors.links = 'Exactly 4 ordered Bridge Links are required.';
    errors.push(fieldErrors.links);
  } else {
    let validLinks = 0;
    links.forEach((card, idx) => {
      const cardTitle = cleanText(card?.title ?? '', 96);
      const key = `link_${idx}`;
      if (cardTitle.length < 6) {
        fieldErrors[key] = `Link #${idx + 1} needs a headline of at least 6 characters.`;
        errors.push(fieldErrors[key]!);
        return;
      }
      const norm = cardTitle.toLowerCase();
      if (seenTitles.has(norm)) {
        fieldErrors[key] = `Link #${idx + 1} duplicates another card title.`;
        errors.push(fieldErrors[key]!);
        return;
      }
      seenTitles.add(norm);
      validLinks += 1;
    });
    checksPassed += validLinks;
  }

  if (trolls.length !== 2) {
    fieldErrors.trolls = 'Exactly 2 plausible Off-Topic Red Herrings are required.';
    errors.push(fieldErrors.trolls);
  } else {
    let validTrolls = 0;
    trolls.forEach((card, idx) => {
      const cardTitle = cleanText(card?.title ?? '', 96);
      const key = `troll_${idx}`;
      if (cardTitle.length < 6) {
        fieldErrors[key] = `Red Herring #${idx + 1} needs at least 6 characters.`;
        errors.push(fieldErrors[key]!);
        return;
      }
      const norm = cardTitle.toLowerCase();
      if (seenTitles.has(norm)) {
        fieldErrors[key] = `Red Herring #${idx + 1} duplicates another card title.`;
        errors.push(fieldErrors[key]!);
        return;
      }
      seenTitles.add(norm);
      validTrolls += 1;
    });
    checksPassed += validTrolls;
  }

  if (hintText.length > 0 && hintText.length < 10) {
    fieldErrors.hintText = 'Optional Top Comment Clue should be at least 10 characters if provided.';
    errors.push(fieldErrors.hintText);
  }

  if (!isValidDifficulty(draft.difficulty)) {
    fieldErrors.difficulty = 'Select Mild, Spicy, or Galaxy Brain difficulty.';
    errors.push(fieldErrors.difficulty);
  }

  return {
    ok: errors.length === 0,
    errors,
    fieldErrors,
    readinessPct: Math.round((checksPassed / totalChecks) * 100),
  };
}

export function sanitizeCommunityDraft(draft: CommunityForgeDraftInput): {
  title: string;
  category: PuzzleCategory;
  subreddit: string;
  difficulty: PuzzleDifficulty;
  openingTitle: string;
  openingExcerpt: string;
  finaleTitle: string;
  finaleExcerpt: string;
  links: [
    CommunityForgeCardInput,
    CommunityForgeCardInput,
    CommunityForgeCardInput,
    CommunityForgeCardInput,
  ];
  trolls: [CommunityForgeCardInput, CommunityForgeCardInput];
  hintText: string;
} {
  const defaultSub = normalizeSubredditName(draft.subreddit || 'r/KarmaForgeDaily');

  const sanitizeCard = (card: CommunityForgeCardInput, fallbackTag: string): CommunityForgeCardInput => ({
    subreddit: normalizeSubredditName(card.subreddit || defaultSub),
    tag: cleanText(card.tag || fallbackTag, 22) || fallbackTag,
    title: cleanText(card.title, 96),
    summary: cleanText(card.summary || card.title, 140),
  });

  return {
    title: cleanText(draft.title, 84),
    category: isValidCategory(draft.category) ? draft.category : 'Internet Culture',
    subreddit: defaultSub,
    difficulty: isValidDifficulty(draft.difficulty) ? draft.difficulty : 'Spicy',
    openingTitle: cleanText(draft.openingTitle, 120),
    openingExcerpt:
      cleanText(draft.openingExcerpt ?? '', 180) || 'Community-forged opening thread anchor.',
    finaleTitle: cleanText(draft.finaleTitle, 120),
    finaleExcerpt:
      cleanText(draft.finaleExcerpt ?? '', 180) || 'Community-forged finale thread destination.',
    links: [
      sanitizeCard(draft.links[0]!, 'Link 1'),
      sanitizeCard(draft.links[1]!, 'Link 2'),
      sanitizeCard(draft.links[2]!, 'Link 3'),
      sanitizeCard(draft.links[3]!, 'Link 4'),
    ],
    trolls: [
      sanitizeCard(draft.trolls[0]!, 'Decoy'),
      sanitizeCard(draft.trolls[1]!, 'Decoy'),
    ],
    hintText:
      cleanText(draft.hintText ?? '', 180) ||
      'Follow the causal handoff from the Opening Post rather than surface keywords.',
  };
}

export function sortCommunitySubmissions(
  items: readonly CommunityPuzzleSubmission[],
): CommunityPuzzleSubmission[] {
  return [...items].sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Curated community seed nominees for tomorrow's featured daily vote queue.
 * Real upvotes and new user submissions persist in Redis / local KV and outrank these naturally.
 */
export function buildSeedCommunityNominees(tomorrowUtc: string): CommunityPuzzleSubmission[] {
  return [
    {
      id: 'cf-seed-mechanical-keyboards',
      title: 'How a 1984 IBM Buckling Spring Spawned ASMR Lo-Fi Streams',
      category: 'Retro Tech',
      subreddit: 'r/MechanicalKeyboards',
      difficulty: 'Spicy',
      authorUsername: 'u/ThockArchitect',
      createdAt: `${tomorrowUtc}T00:01:00.000Z`,
      targetDateUtc: tomorrowUtc,
      openingPost: {
        subreddit: 'r/MechanicalKeyboards',
        author: 'u/ThockArchitect',
        flair: 'Hardware Lore',
        upvotes: '14.2k',
        title: 'Found an IBM Model M terminal keyboard in a basement closet',
        excerpt: 'Steel backplate weighs four pounds and every keypress rings across the hallway.',
      },
      finalePost: {
        subreddit: 'r/StudyWithMe',
        author: 'u/MidnightLoFi',
        flair: 'Live Stream',
        upvotes: '22.8k',
        title: 'Why 40,000 night owls fall asleep to lubed switch typing audio',
        excerpt: 'Creamy acoustic mods turned noisy office hardware into late-night focus radio.',
      },
      links: [
        {
          subreddit: 'r/BuyItForLife',
          tag: 'Switch Tech',
          title: 'Buckling springs give tactile feedback right at actuation',
          summary: 'Collectors realize membrane boards killed physical typing rhythm.',
        },
        {
          subreddit: 'r/CustomKeyboards',
          tag: 'Acoustics',
          title: 'Enthusiasts start modding stabilizers with Krytox lube and tape',
          summary: 'The sound signature shifts from sharp clack to deep resonant thock.',
        },
        {
          subreddit: 'r/AudioEngineering',
          tag: 'Recording',
          title: 'Desk sound-test videos blow up with close-mic stereo condensers',
          summary: 'Short build clips become hypnotic 10-hour background loops.',
        },
        {
          subreddit: 'r/FocusMusic',
          tag: 'Streaming',
          title: 'Creators layer rhythmic typing loops under rain and vinyl crackle',
          summary: 'Late-night coders treat tactile keystroke cadence like white noise.',
        },
      ],
      trolls: [
        {
          subreddit: 'r/TechMyths',
          tag: 'Red Herring',
          title: 'RGB underglow LEDs reduce USB polling latency by 12ms',
          summary: 'Lighting circuits share power only and never speed up switch scanning.',
        },
        {
          subreddit: 'r/OfficeHumor',
          tag: 'Red Herring',
          title: 'QWERTY was patented in 1995 specifically for gaming mice',
          summary: 'Sholes designed QWERTY in the 1870s for mechanical typebars.',
        },
      ],
      hintText: 'Track how loud office tactility got tuned into a deep studio audio loop.',
      votes: 42,
      hasVoted: false,
      isCuratedSeed: true,
    },
    {
      id: 'cf-seed-sourdough-wifi',
      title: 'From San Francisco Fog Wild Yeast to Smart Fermentation Sensors',
      category: 'Cooking',
      subreddit: 'r/Sourdough',
      difficulty: 'Mild',
      authorUsername: 'u/CrumbDebugger',
      createdAt: `${tomorrowUtc}T00:02:00.000Z`,
      targetDateUtc: tomorrowUtc,
      openingPost: {
        subreddit: 'r/Sourdough',
        author: 'u/CrumbDebugger',
        flair: 'Starter Help',
        upvotes: '9.6k',
        title: 'My 7-day flour and water jar finally doubled overnight',
        excerpt: 'Bubbles hit the rubber band at 3 AM and smelled faintly like green apples.',
      },
      finalePost: {
        subreddit: 'r/HomeAutomation',
        author: 'u/BakerNode',
        flair: 'ESP32 Build',
        upvotes: '11.4k',
        title: 'Built a temperature-logged proofing box that pings my watch at peak rise',
        excerpt: 'No more overproofed pancakes when apartment heating turns off at dawn.',
      },
      links: [
        {
          subreddit: 'r/Microbiology',
          tag: 'Symbiosis',
          title: 'Lactic acid bacteria drop pH so wild yeast outcompetes stray mold',
          summary: 'A stable starter acts like a resilient miniature ecosystem.',
        },
        {
          subreddit: 'r/Breadit',
          tag: 'Bulk Rise',
          title: 'A 3-degree kitchen draft doubles fermentation wait times unexpectedly',
          summary: 'Home bakers learn dough temperature matters more than clock recipes.',
        },
        {
          subreddit: 'r/DIY',
          tag: 'Thermal Box',
          title: 'Seedling heat mats inside insulated coolers hold steady 26C warmth',
          summary: 'Cheap gardening gear gives apartment kitchens bakery predictability.',
        },
        {
          subreddit: 'r/ESP32',
          tag: 'Telemetry',
          title: 'A $4 ultrasonic sensor charts starter jar height over local Wi-Fi',
          summary: 'Alerts fire the exact minute fermentation hits 75 percent dome peak.',
        },
      ],
      trolls: [
        {
          subreddit: 'r/FoodMyths',
          tag: 'Red Herring',
          title: 'Metal spoons instantly sterilize active wild yeast cultures',
          summary: 'Stainless steel is inert during brief stirring and never harms starters.',
        },
        {
          subreddit: 'r/Baking',
          tag: 'Red Herring',
          title: 'Scoring dough with a razor lets steam escape so gluten disappears',
          summary: 'Scoring controls oven spring direction; it does not destroy gluten.',
        },
      ],
      hintText: 'Follow the problem of unpredictable kitchen temperature into DIY sensor automation.',
      votes: 31,
      hasVoted: false,
      isCuratedSeed: true,
    },
    {
      id: 'cf-seed-voyager-vinyl',
      title: 'How a 1977 Copper Phonograph Became Interstellar Time-Capsule Code',
      category: 'Science',
      subreddit: 'r/Space',
      difficulty: 'Galaxy Brain',
      authorUsername: 'u/PulsarMap',
      createdAt: `${tomorrowUtc}T00:03:00.000Z`,
      targetDateUtc: tomorrowUtc,
      openingPost: {
        subreddit: 'r/Space',
        author: 'u/PulsarMap',
        flair: 'Deep Space',
        upvotes: '31.5k',
        title: 'Why NASA packed a gold-plated copper LP instead of magnetic tape on Voyager',
        excerpt: 'Cosmic radiation scrambles magnetic bits long before a probe clears the heliopause.',
      },
      finalePost: {
        subreddit: 'r/ReverseEngineering',
        author: 'u/SignalDecoder',
        flair: 'DSP Writeup',
        upvotes: '18.9k',
        title: 'We decoded the 116 hidden images from Voyager audio waveforms in Python',
        excerpt: 'The cover diagram literally teaches an alien engineer how to sync scanlines.',
      },
      links: [
        {
          subreddit: 'r/MaterialsScience',
          tag: 'Longevity',
          title: 'Physical analog grooves survive billions of years in vacuum radiation',
          summary: 'Mechanical etching avoids bit-rot that destroys magnetic tape.',
        },
        {
          subreddit: 'r/Physics',
          tag: 'Universal Clock',
          title: 'The hydrogen spin-flip transition defines an alien-readable base second',
          summary: 'Cover glyphs express playback speed without human minutes or Hertz.',
        },
        {
          subreddit: 'r/DSP',
          tag: 'Image Audio',
          title: 'Engineers encode slow-scan black-and-white photos directly as sound waves',
          summary: 'Each 8-millisecond audio burst draws one vertical stripe of a picture.',
        },
        {
          subreddit: 'r/DataHoarder',
          tag: 'Calibration',
          title: 'The very first encoded frame is a pure circle to verify aspect ratio',
          summary: 'Decoders know their timing math succeeded when the circle renders round.',
        },
      ],
      trolls: [
        {
          subreddit: 'r/SpaceMyths',
          tag: 'Red Herring',
          title: 'Voyager beams Spotify playlists back using laser starlink relays',
          summary: 'Voyager communicates via 1970s 23-watt S-band and X-band radio only.',
        },
        {
          subreddit: 'r/MusicHistory',
          tag: 'Red Herring',
          title: 'The Golden Record runs at standard 78 RPM to match antique jukeboxes',
          summary: 'It actually spins at a custom slow 16-2/3 RPM to double recording time.',
        },
      ],
      hintText: 'Notice how analog grooves need a universal clock before sound waves decode into pictures.',
      votes: 27,
      hasVoted: false,
      isCuratedSeed: true,
    },
  ];
}

export const QUICK_FORGE_PRESETS: readonly CommunityForgeDraftInput[] = [
  {
    title: 'How a 1990s Tamagotchi Beep Inspired Modern Pomodoro Focus Timers',
    category: 'Internet Culture',
    subreddit: 'r/Nostalgia',
    difficulty: 'Mild',
    openingTitle: 'Remember sneaking a keychain virtual pet into math class in 1997?',
    openingExcerpt: 'Three tiny LCD chimes meant feed it now or come home to a pixelated ghost.',
    finaleTitle: 'Why cozy pixel companions now power top productivity focus apps',
    finaleExcerpt: 'Guilt-free caretaking loops beat harsh alarm clocks every single week.',
    links: [
      {
        subreddit: 'r/GameDesign',
        tag: 'Micro Loop',
        title: 'Tiny real-time check-ins create emotional attachment in 8 pixels',
        summary: 'Players check back every hour because small needs feel alive.',
      },
      {
        subreddit: 'r/Psychology',
        tag: 'Habit Cue',
        title: 'Loss aversion makes protecting a virtual streak stronger than points',
        summary: 'Nobody wants a happy companion to wilt from one skipped session.',
      },
      {
        subreddit: 'r/Productivity',
        tag: 'Pomodoro',
        title: '25-minute focus sprints adopt growing trees and pixel pets as timers',
        summary: 'Leaving the app early pauses growth, keeping phones face-down.',
      },
      {
        subreddit: 'r/IndieDev',
        tag: 'Cozy Tech',
        title: 'Desktop menu-bar pets reward clean coding streaks with pixel hats',
        summary: 'Soft ambient accountability replaces noisy notification badges.',
      },
    ],
    trolls: [
      {
        subreddit: 'r/TechMyths',
        tag: 'Red Herring',
        title: 'Original Tamagotchis required dial-up modems to sync time zones',
        summary: 'They ran completely offline on a simple quartz crystal and coin cell.',
      },
      {
        subreddit: 'r/Productivity',
        tag: 'Red Herring',
        title: 'Pomodoro was named after a French stopwatch factory in Lyon',
        summary: 'Francesco Cirillo named it after his Italian tomato kitchen timer.',
      },
    ],
    hintText: 'Follow the 8-pixel caretaking loop into loss aversion and 25-minute focus timers.',
  },
  {
    title: 'How Bubble Wrap Failed as Wallpaper and Conquered E-Commerce Logistics',
    category: 'History',
    subreddit: 'r/TodayILearned',
    difficulty: 'Spicy',
    openingTitle: 'Two 1957 engineers sealed two shower curtains to invent textured wallpaper',
    openingExcerpt: 'Nobody wanted plastic air pockets glued to their living room drywall.',
    finaleTitle: 'How automated air-pillow machines wrap 300 million parcels every week',
    finaleExcerpt: 'Flat film ships to warehouses and inflates on demand at the packing bench.',
    links: [
      {
        subreddit: 'r/DesignHistory',
        tag: 'Pivot',
        title: 'After wallpaper flopped, they pitched the sheet as greenhouse insulation',
        summary: 'Trapped air slowed heat loss, but sales remained tiny.',
      },
      {
        subreddit: 'r/RetroComputing',
        tag: 'IBM Break',
        title: 'IBM needed featherlight cushioning to ship fragile 1401 mainframes',
        summary: 'Newspaper crumpled under heavy cabinets, so Sealed Air won the contract.',
      },
      {
        subreddit: 'r/Logistics',
        tag: 'Freight Cost',
        title: 'Shipping pre-inflated rolls meant trucks hauled mostly empty air',
        summary: 'Warehouses ran out of ceiling space storing bulky cushion coils.',
      },
      {
        subreddit: 'r/Engineering',
        tag: 'On-Demand',
        title: 'Benchtop heat-sealers inflate flat recyclable sleeves seconds before taping',
        summary: 'One compact roll replaces an entire trailer of pre-popped wrap.',
      },
    ],
    trolls: [
      {
        subreddit: 'r/Chemistry',
        tag: 'Red Herring',
        title: 'Bubble wrap pockets are filled with pressurized helium to cut weight',
        summary: 'Ordinary ambient air fills every cell; helium would diffuse out in hours.',
      },
      {
        subreddit: 'r/HistoryMyths',
        tag: 'Red Herring',
        title: 'NASA invented bubble wrap exclusively for Apollo moon boots',
        summary: 'Fielding and Chavannes created it in 1957 before NASA even existed.',
      },
    ],
    hintText: 'Look for the IBM mainframe shipping breakthrough that created a warehouse volume problem.',
  },
];
