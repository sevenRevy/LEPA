import { DETECTOR_CONFIG } from '@/features/reddit-detector/config';
import type {
  AuthorAnalysis,
  DetectorHistoryEntry,
  DetectorReport,
  DetectorPostSummary,
  MatchResult,
  RedditAboutResponse,
  RedditCommentData,
  RedditListingResponse,
  RedditPostData,
  ScoreLevel,
  SubredditFrequencyRow,
  TitleBodyAnalysis,
} from '@/features/reddit-detector/types';

const SEMANTIC_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'for',
  'how',
  'i',
  'is',
  'it',
  'me',
  'my',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'of',
  'os',
  'pra',
  'para',
  'por',
  'que',
  'the',
  'to',
  'um',
  'uma',
  'umas',
  'uns',
  'with',
]);

const SEMANTIC_CANONICAL_TOKENS = new Map<string, string>([
  ['acontecendo', 'acontece'],
  ['aconteceu', 'acontece'],
  ['acontecer', 'acontece'],
  ['acontece', 'acontece'],
  ['relacionamentos', 'relacionamento'],
  ['relacoes', 'relacao'],
  ['relacao', 'relacao'],
  ['relacionamento', 'relacionamento'],
  ['namoros', 'namoro'],
  ['namoro', 'namoro'],
  ['casais', 'casal'],
  ['casal', 'casal'],
]);

function stripDiacritics(input: string) {
  return input.normalize('NFD').replace(/\p{M}/gu, '');
}

export function normalizeText(input: string | undefined | null) {
  return stripDiacritics(String(input ?? ''))
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input: string) {
  return new Set(normalizeText(input).split(' ').filter(Boolean));
}

function normalizeSemanticToken(token: string) {
  const canonical = SEMANTIC_CANONICAL_TOKENS.get(token) ?? token;

  if (canonical.length > 6 && canonical.endsWith('s')) {
    return canonical.slice(0, -1);
  }

  return canonical;
}

function semanticTokens(input: string) {
  return new Set(
    normalizeText(input)
      .split(' ')
      .filter(Boolean)
      .filter((token) => !SEMANTIC_STOP_WORDS.has(token))
      .map(normalizeSemanticToken)
      .filter(Boolean),
  );
}

function buildCharacterNgrams(input: string, size = 3) {
  const normalized = normalizeText(input);

  if (!normalized) {
    return new Set<string>();
  }

  if (normalized.length <= size) {
    return new Set([normalized]);
  }

  const ngrams = new Set<string>();
  for (let index = 0; index <= normalized.length - size; index += 1) {
    ngrams.add(normalized.slice(index, index + size));
  }

  return ngrams;
}

function setJaccardSimilarity(left: Set<string>, right: Set<string>) {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function setContainmentSimilarity(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) {
      intersection += 1;
    }
  }

  return intersection / Math.min(left.size, right.size);
}

export function jaccardSimilarity(left: string, right: string) {
  return setJaccardSimilarity(tokenize(left), tokenize(right));
}

export function semanticTitleSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  if (!normalizedLeft && !normalizedRight) {
    return 1;
  }

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  const tokenScore = setJaccardSimilarity(semanticTokens(left), semanticTokens(right));
  const containmentScore = setContainmentSimilarity(semanticTokens(left), semanticTokens(right));
  const trigramScore = setJaccardSimilarity(
    buildCharacterNgrams(left),
    buildCharacterNgrams(right),
  );

  return Math.max(
    tokenScore * 0.4 + containmentScore * 0.35 + trigramScore * 0.25,
    containmentScore * 0.65 + trigramScore * 0.35,
  );
}

export function hoursBetween(leftMs: number, rightMs: number) {
  return Math.abs(leftMs - rightMs) / 3_600_000;
}

export function formatAgeDays(days: number) {
  if (days < 1) return `${(days * 24).toFixed(1)}h`;
  if (days < 30) return `${days.toFixed(1)}d`;
  if (days < 365) return `${(days / 30.44).toFixed(1)}mo`;
  return `${(days / 365.25).toFixed(1)}y`;
}

function isModeratorRemoved(post: RedditPostData) {
  const removalCategory = post.removed_by_category?.toLowerCase();
  const bannedBy = post.banned_by?.toLowerCase();

  return (
    removalCategory === 'moderator' ||
    bannedBy === 'true' ||
    Boolean(post.mod_reason_title) ||
    (Boolean(post.removal_reason) && removalCategory === 'moderator')
  );
}

function isDeletedPost(post: RedditPostData) {
  return post.author === '[deleted]' || post.selftext?.trim().toLowerCase() === '[deleted]';
}

function formatHistoryAge(createdUtc?: number) {
  if (!createdUtc) return 'Unknown age';

  const ageDays = (Date.now() - createdUtc * 1000) / 86_400_000;
  return `${formatAgeDays(ageDays)} ago`;
}

function titleFromPermalink(permalink?: string) {
  if (!permalink) return null;

  const segments = permalink.split('/').filter(Boolean);
  const commentsIndex = segments.findIndex((segment) => segment === 'comments');
  const slug = commentsIndex >= 0 ? segments[commentsIndex + 2] : segments.at(-1);

  if (!slug) return null;

  return decodeURIComponent(slug).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

function sanitizeRecoveredTitle(title?: string | null) {
  const normalizedTitle = title?.trim();

  if (!normalizedTitle) return null;

  const lowered = normalizedTitle.toLowerCase();
  const canonicalPlaceholder = lowered.replace(/[\[\]\s]+/g, ' ').trim();

  if (
    lowered === '[removed]' ||
    lowered === '[deleted]' ||
    canonicalPlaceholder === 'removed' ||
    canonicalPlaceholder === 'deleted' ||
    canonicalPlaceholder === 'removed by moderator'
  ) {
    return null;
  }

  return normalizedTitle;
}

function resolveHistoryTitle(post: RedditPostData, removed: boolean, deleted: boolean) {
  const baseTitle =
    sanitizeRecoveredTitle(post.title) ?? sanitizeRecoveredTitle(titleFromPermalink(post.permalink));

  if (removed) {
    return baseTitle ? `${baseTitle} [ Removed by moderator ]` : '[ Removed by moderator ]';
  }

  if (deleted) {
    return baseTitle ? `${baseTitle} [ Deleted ]` : '[ Deleted ]';
  }

  return baseTitle ?? 'Untitled post';
}

function buildHistoryEntries(
  post: RedditPostData,
  submitted: RedditListingResponse<RedditPostData> | null,
): DetectorHistoryEntry[] {
  const submittedPosts =
    submitted?.data?.children
      ?.filter((child) => child.kind === 't3')
      .map((child) => child.data)
      .filter((candidate): candidate is RedditPostData => Boolean(candidate) && Boolean(candidate.title)) ?? [];

  const currentPost = submittedPosts.find((candidate) => candidate.name === post.name) ?? post;
  const orderedPosts = [
    currentPost,
    ...submittedPosts.filter((candidate) => candidate.name !== currentPost.name),
  ];

  return orderedPosts.map((candidate) => {
    const isCurrent = candidate.name === post.name;
    const removed = isModeratorRemoved(candidate);
    const deleted = isDeletedPost(candidate);

    return {
      href: candidate.permalink ? `${globalThis.location.origin}${candidate.permalink}` : null,
      id: candidate.name ?? `${candidate.title}-${candidate.created_utc ?? 0}`,
      isCurrent,
      statusLabel: isCurrent ? 'Current' : removed ? 'Removed' : deleted ? 'Deleted' : 'Visible',
      statusTone: isCurrent ? 'default' : removed ? 'destructive' : 'outline',
      subreddit: candidate.subreddit_name_prefixed ?? `r/${candidate.subreddit}`,
      title: resolveHistoryTitle(candidate, removed, deleted),
      when: formatHistoryAge(candidate.created_utc),
    };
  });
}

export function classifyScore(score: number): ScoreLevel {
  if (score >= DETECTOR_CONFIG.scoreThresholds.high) return 'high';
  if (score >= DETECTOR_CONFIG.scoreThresholds.medium) return 'medium';
  return 'low';
}

export function buildVerdict(score: number) {
  const level = classifyScore(score);

  if (level === 'high') return 'Likely ragebait / spammy / low-quality';
  if (level === 'medium') return 'Possibly bait or low-quality';
  return 'No strong bait pattern detected';
}

export function calcCapsRatio(input: string) {
  const letters = [...input].filter((character) => /[A-Za-z]/.test(character));
  if (letters.length === 0) return 0;

  const caps = letters.filter((character) => character === character.toUpperCase()).length;
  return caps / letters.length;
}

export function countMatches(input: string, terms: readonly string[]): MatchResult {
  const normalized = normalizeText(input);
  const hits = terms.filter((term) => normalized.includes(normalizeText(term)));

  return {
    count: hits.length,
    hits,
  };
}

function isModeratorRemovedSubmission(post: RedditPostData) {
  const removalCategory = post.removed_by_category?.toLowerCase();
  const bannedBy = post.banned_by?.toLowerCase();

  return (
    removalCategory === 'moderator' ||
    bannedBy === 'true' ||
    Boolean(post.mod_reason_title) ||
    (Boolean(post.removal_reason) && removalCategory === 'moderator')
  );
}

function buildSubredditFrequencyRows(
  submitted: RedditListingResponse<RedditPostData> | null,
  comments: RedditListingResponse<RedditCommentData> | null,
): SubredditFrequencyRow[] {
  const submittedPosts =
    submitted?.data?.children
      ?.filter((child) => child.kind === 't3')
      .map((child) => child.data)
      .filter(
        (candidate): candidate is RedditPostData => Boolean(candidate) && Boolean(candidate.subreddit),
      ) ?? [];
  const submittedComments =
    comments?.data?.children
      ?.filter((child) => child.kind === 't1')
      .map((child) => child.data)
      .filter(
        (candidate): candidate is RedditCommentData =>
          Boolean(candidate) && Boolean(candidate.subreddit),
      ) ?? [];

  const postTotal = submittedPosts.length;
  const commentTotal = submittedComments.length;
  const bySubreddit = new Map<
    string,
    {
      commentCount: number;
      postCount: number;
      subreddit: string;
      subredditLabel: string;
    }
  >();

  for (const post of submittedPosts) {
    const key = post.subreddit.toLowerCase();
    const current =
      bySubreddit.get(key) ?? {
        commentCount: 0,
        postCount: 0,
        subreddit: post.subreddit,
        subredditLabel: post.subreddit_name_prefixed ?? `r/${post.subreddit}`,
      };

    current.postCount += 1;
    bySubreddit.set(key, current);
  }

  for (const comment of submittedComments) {
    const key = comment.subreddit.toLowerCase();
    const current =
      bySubreddit.get(key) ?? {
        commentCount: 0,
        postCount: 0,
        subreddit: comment.subreddit,
        subredditLabel: comment.subreddit_name_prefixed ?? `r/${comment.subreddit}`,
      };

    current.commentCount += 1;
    bySubreddit.set(key, current);
  }

  return [...bySubreddit.values()]
    .map((entry) => ({
      commentCount: entry.commentCount,
      commentRatio: commentTotal > 0 ? entry.commentCount / commentTotal : null,
      postCount: entry.postCount,
      postRatio: postTotal > 0 ? entry.postCount / postTotal : null,
      subreddit: entry.subreddit,
      subredditLabel: entry.subredditLabel,
    }))
    .sort((left, right) => {
      const leftMax = Math.max(left.postRatio ?? 0, left.commentRatio ?? 0);
      const rightMax = Math.max(right.postRatio ?? 0, right.commentRatio ?? 0);

      if (rightMax !== leftMax) {
        return rightMax - leftMax;
      }

      const leftTotal = left.postCount + left.commentCount;
      const rightTotal = right.postCount + right.commentCount;

      if (rightTotal !== leftTotal) {
        return rightTotal - leftTotal;
      }

      return left.subreddit.localeCompare(right.subreddit);
    });
}

function getDominantSubredditActivity(subredditFrequencies: SubredditFrequencyRow[]) {
  const totalActivity = subredditFrequencies.reduce(
    (sum, entry) => sum + entry.postCount + entry.commentCount,
    0,
  );

  if (totalActivity === 0) {
    return null;
  }

  let dominantEntry: SubredditFrequencyRow | null = null;
  let dominantCount = 0;

  for (const entry of subredditFrequencies) {
    const entryCount = entry.postCount + entry.commentCount;
    if (entryCount > dominantCount) {
      dominantEntry = entry;
      dominantCount = entryCount;
    }
  }

  if (!dominantEntry) {
    return null;
  }

  return {
    entry: dominantEntry,
    ratio: dominantCount / totalActivity,
    totalActivity,
  };
}

export function analyzeTitleAndBody(post: RedditPostData): TitleBodyAnalysis {
  const title = post.title ?? '';
  const body = post.selftext ?? '';
  const fullText = `${title}\n${body}`;
  const bait = DETECTOR_CONFIG.baitDetectionEnabled
    ? countMatches(fullText, DETECTOR_CONFIG.baitTerms)
    : { count: 0, hits: [] };
  const lowEffort = countMatches(title, DETECTOR_CONFIG.lowEffortTitleTerms);

  let points = 0;
  const reasons: string[] = [];

  if (bait.count >= 1) {
    points += Math.min(24, bait.count * 8);
    reasons.push(`Bait-like phrases found: ${bait.hits.slice(0, 6).join(', ')}`);
  }

  if (lowEffort.count >= 1) {
    points += Math.min(12, lowEffort.count * 4);
    reasons.push(`Low-effort title patterns: ${lowEffort.hits.slice(0, 6).join(', ')}`);
  }

  const questionMarks = (title.match(/\?/g) || []).length;
  const exclamationMarks = (title.match(/!/g) || []).length;
  if (questionMarks >= 2 || exclamationMarks >= 2) {
    points += 6;
    reasons.push('Excessive punctuation in title');
  }

  const capsRatio = calcCapsRatio(title);
  if (capsRatio > 0.45 && title.length >= 10) {
    points += 8;
    reasons.push('High uppercase ratio in title');
  }

  return {
    baitHits: bait.hits,
    lowEffortHits: lowEffort.hits,
    points,
    reasons,
  };
}

export function analyzeAuthor(
  post: RedditPostData,
  about: RedditAboutResponse | null,
  submitted: RedditListingResponse<RedditPostData> | null,
  comments: RedditListingResponse<RedditCommentData> | null = null,
): AuthorAnalysis {
  const reasons: string[] = [];
  let points = 0;

  const now = Date.now();
  const aboutAvailable = Boolean(about?.data);
  const commentsAvailable = comments !== null;
  const submittedAvailable = submitted !== null;
  const authorSignalsAvailable = aboutAvailable && submittedAvailable;
  const authorCreatedUtc = about?.data?.created_utc ?? null;
  const linkKarma = about?.data?.link_karma ?? null;
  const commentKarma = about?.data?.comment_karma ?? null;
  const combinedKarma =
    linkKarma !== null && commentKarma !== null ? linkKarma + commentKarma : null;
  const sampledPosts =
    submitted?.data?.children
      ?.filter((child) => child.kind === 't3')
      .map((child) => child.data)
      .filter(
        (candidate): candidate is RedditPostData => Boolean(candidate) && Boolean(candidate.title),
      ) ?? [];
  const sampledComments =
    comments?.data?.children
      ?.filter((child) => child.kind === 't1')
      .map((child) => child.data)
      .filter(
        (candidate): candidate is RedditCommentData =>
          Boolean(candidate) && Boolean(candidate.subreddit),
      ) ?? [];
  const moderatorRemovedPosts = sampledPosts.filter(isModeratorRemovedSubmission);
  const historyComparisonPosts = sampledPosts.filter((candidate) => candidate.name !== post.name);
  const subredditFrequencies = buildSubredditFrequencyRows(submitted, comments);
  const dominantSubredditActivity = getDominantSubredditActivity(subredditFrequencies);

  let accountAgeDays: number | null = null;
  let burstPostCount: number | null = null;
  let postsPerDay: number | null = null;
  let sameSubredditRatio: number | null = null;
  let repeatedTitleCount: number | null = null;
  let repeatedShortWindowCount: number | null = null;

  if (authorSignalsAvailable) {
    if (authorCreatedUtc) {
      accountAgeDays = (now - authorCreatedUtc * 1000) / 86_400_000;
      if (accountAgeDays < DETECTOR_CONFIG.veryNewAccountDays) {
        points += 22;
        reasons.push(`Very new account (${formatAgeDays(accountAgeDays)})`);
      } else if (accountAgeDays < DETECTOR_CONFIG.newAccountDays) {
        points += 12;
        reasons.push(`New account (${formatAgeDays(accountAgeDays)})`);
      }
    }

    if (combinedKarma !== null) {
      if (combinedKarma < DETECTOR_CONFIG.veryLowCombinedKarmaThreshold) {
        points += 18;
        reasons.push(`Very low combined karma (${combinedKarma})`);
      } else if (combinedKarma < DETECTOR_CONFIG.lowCombinedKarmaThreshold) {
        points += 9;
        reasons.push(`Low combined karma (${combinedKarma})`);
      }
    }

    if (moderatorRemovedPosts.length > 0) {
      points += Math.min(8, moderatorRemovedPosts.length * 4);
      reasons.push(
        `${moderatorRemovedPosts.length} recent post${moderatorRemovedPosts.length === 1 ? '' : 's'} removed by moderators`,
      );
    }

    if (sampledPosts.length === 1) {
      points += 2;
      reasons.push(
        'Only one visible post was found in recent history, so history-based signals have a wide margin of error',
      );
    }

    if (
      dominantSubredditActivity &&
      dominantSubredditActivity.totalActivity >= 2 &&
      dominantSubredditActivity.ratio > DETECTOR_CONFIG.sameSubredditActivityThreshold
    ) {
      points += 6;
      reasons.push(
        `Over 50% of visible activity is concentrated in ${dominantSubredditActivity.entry.subredditLabel}`,
      );
    }

    postsPerDay = 0;
    burstPostCount = 0;
    repeatedTitleCount = 0;
    repeatedShortWindowCount = 0;

    if (sampledPosts.length >= 2 && authorCreatedUtc) {
      const spanDays = Math.max(1 / 24, (now - authorCreatedUtc * 1000) / 86_400_000);
      postsPerDay = sampledPosts.length / spanDays;

      if (postsPerDay >= DETECTOR_CONFIG.veryHighPostsPerDayThreshold) {
        points += 18;
        reasons.push(`Very high post frequency in sampled history (${postsPerDay.toFixed(1)}/day)`);
      } else if (postsPerDay >= DETECTOR_CONFIG.highPostsPerDayThreshold) {
        points += 10;
        reasons.push(`High post frequency in sampled history (${postsPerDay.toFixed(1)}/day)`);
      }
    }

    if (sampledPosts.length > 0) {
      const sameSubPosts = sampledPosts.filter(
        (candidate) => candidate.subreddit === post.subreddit,
      ).length;
      sameSubredditRatio = sameSubPosts / sampledPosts.length;

      if (
        sameSubredditRatio >= DETECTOR_CONFIG.sameSubredditDominanceThreshold &&
        sampledPosts.length >= 8
      ) {
        points += 8;
        reasons.push(`Most recent posts heavily concentrated in r/${post.subreddit}`);
      }

      if (post.created_utc) {
        const postMs = post.created_utc * 1000;
        burstPostCount = sampledPosts.filter((candidate) => {
          const candidateMs = (candidate.created_utc ?? 0) * 1000;
          return hoursBetween(postMs, candidateMs) <= DETECTOR_CONFIG.repeatedPostWindowHours;
        }).length;

        if (burstPostCount >= 6) {
          points += 16;
          reasons.push(
            `${burstPostCount} sampled posts landed within ${DETECTOR_CONFIG.repeatedPostWindowHours}h`,
          );
        } else if (burstPostCount >= 3) {
          points += 9;
          reasons.push(
            `${burstPostCount} sampled posts landed within ${DETECTOR_CONFIG.repeatedPostWindowHours}h`,
          );
        }
      }

      if (historyComparisonPosts.length > 0) {
        const currentTitle = post.title ?? '';
        for (const candidate of historyComparisonPosts) {
          if (
            semanticTitleSimilarity(currentTitle, candidate.title ?? '') >=
            DETECTOR_CONFIG.repeatedTitleSimilarityMin
          ) {
            repeatedTitleCount += 1;
          }
        }

        if (repeatedTitleCount >= 3) {
          points += 16;
          reasons.push(`Repeated similar titles in recent posts (${repeatedTitleCount})`);
        } else if (repeatedTitleCount >= 1) {
          points += 7;
          reasons.push('At least one very similar recent title');
        }

        if (post.created_utc) {
          const postMs = post.created_utc * 1000;
          for (const candidate of historyComparisonPosts) {
            const candidateMs = (candidate.created_utc ?? 0) * 1000;
            if (hoursBetween(postMs, candidateMs) <= DETECTOR_CONFIG.repeatedPostWindowHours) {
              repeatedShortWindowCount += 1;
            }
          }
        } else {
          repeatedShortWindowCount = null;
        }
      }
    }

    if (
      accountAgeDays !== null &&
      accountAgeDays < DETECTOR_CONFIG.newAccountDays &&
      sampledPosts.length >= 10
    ) {
      points += 10;
      reasons.push('New account with already-heavy posting');
    }
  } else {
    reasons.push('Author profile is private or unavailable; account-based signals were excluded.');
  }

  if (post.crosspost_parent) {
    points += 4;
    reasons.push('Crosspost detected');
  }

  if (post.over_18) {
    points += 2;
    reasons.push('NSFW post');
  }

  return {
    meta: {
      accountAgeDays,
      authorSignalsAvailable,
      aboutAvailable,
      burstPostCount,
      combinedKarma,
      commentsAvailable,
      commentKarma,
      linkKarma,
      moderatorRemovedPosts: authorSignalsAvailable ? moderatorRemovedPosts.length : null,
      postsPerDay,
      repeatedShortWindowCount,
      repeatedTitleCount,
      sampledComments: commentsAvailable ? sampledComments.length : null,
      sampledPosts: authorSignalsAvailable ? sampledPosts.length : null,
      sameSubredditRatio,
      submittedAvailable,
    },
    points,
    reasons,
    subredditFrequencies,
  };
}

export function buildDetectorReport(
  post: RedditPostData,
  about: RedditAboutResponse | null,
  submitted: RedditListingResponse<RedditPostData> | null,
  comments: RedditListingResponse<RedditCommentData> | null = null,
): DetectorReport {
  const title = analyzeTitleAndBody(post);
  const author = analyzeAuthor(post, about, submitted, comments);
  const totalScore = title.points + author.points;
  const clampedScore = Math.max(0, Math.min(100, Math.round(totalScore)));
  const postSummary: DetectorPostSummary = {
    author: post.author,
    name: post.name,
    score: post.score ?? null,
  };

  return {
    author,
    clampedScore,
    history: buildHistoryEntries(post, submitted),
    level: classifyScore(clampedScore),
    post: postSummary,
    title,
    totalScore,
    verdict: buildVerdict(clampedScore),
  };
}
