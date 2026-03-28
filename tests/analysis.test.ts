import {
  buildDetectorReport,
  classifyScore,
  countMatches,
  semanticTitleSimilarity,
} from '@/features/reddit-detector/analysis';
import type {
  RedditAboutResponse,
  RedditCommentData,
  RedditListingResponse,
  RedditPostData,
} from '@/features/reddit-detector/types';

const nowSeconds = 1_710_000_000;

function buildPost(overrides: Partial<RedditPostData> = {}): RedditPostData {
  return {
    author: 'freshbait',
    created_utc: nowSeconds,
    name: 't3_current',
    over_18: false,
    selftext: 'Prove me wrong, everyone is wrong about this.',
    subreddit: 'technology',
    subreddit_name_prefixed: 'r/technology',
    title: 'AM I THE ONLY ONE who thinks this is insane??',
    ...overrides,
  };
}

function buildSubmitted(posts: RedditPostData[]): RedditListingResponse<RedditPostData> {
  return {
    data: {
      children: posts.map((post) => ({ data: post, kind: 't3' })),
    },
  };
}

function buildComments(comments: RedditCommentData[]): RedditListingResponse<RedditCommentData> {
  return {
    data: {
      children: comments.map((comment) => ({ data: comment, kind: 't1' })),
    },
  };
}

describe('detector heuristics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowSeconds * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts bait phrases after normalization', () => {
    expect(countMatches('Change my mind: this is literal bait.', ['change my mind', 'bait'])).toEqual({
      count: 2,
      hits: ['change my mind', 'bait'],
    });
  });

  it('finds semantic title similarity across accents and filler words', () => {
    expect(
      semanticTitleSimilarity(
        'O que está acontecendo com os relacionamentos?',
        'O que esta acontecendo nos relacionamentos de hoje',
      ),
    ).toBeGreaterThanOrEqual(0.72);
    expect(semanticTitleSimilarity('This is wild news', 'Completely unrelated post')).toBeLessThan(
      0.3,
    );
  });

  it('produces a high-risk score for a brand-new, hyperactive author', () => {
    const post = buildPost();
    const about: RedditAboutResponse = {
      data: {
        comment_karma: 4,
        created_utc: nowSeconds - 60 * 60 * 24,
        link_karma: 5,
      },
    };

    const repeatedPosts = Array.from({ length: 12 }, (_, index) =>
      buildPost({
        created_utc: nowSeconds - index * 60 * 60,
        name: `t3_repeat_${index}`,
        title: `AM I THE ONLY ONE who thinks this is insane?? ${index % 2 === 0 ? 'today' : 'now'}`,
      }),
    );

    const report = buildDetectorReport(post, about, buildSubmitted(repeatedPosts));

    expect(report.clampedScore).toBeGreaterThanOrEqual(70);
    expect(classifyScore(report.clampedScore)).toBe('high');
    expect(report.author.reasons.join(' ')).toContain('Very new account');
  });

  it('keeps low-risk authors below the danger threshold', () => {
    const post = buildPost({
      author: 'steadyuser',
      selftext: 'A normal explanation of what happened.',
      title: 'Detailed breakdown of the event timeline',
    });
    const about: RedditAboutResponse = {
      data: {
        comment_karma: 820,
        created_utc: nowSeconds - 60 * 60 * 24 * 365,
        link_karma: 1240,
      },
    };

    const submitted = buildSubmitted([
      buildPost({
        author: 'steadyuser',
        created_utc: nowSeconds - 60 * 60 * 24 * 10,
        name: 't3_old_1',
        selftext: 'Long-form summary of a topic.',
        subreddit: 'books',
        title: 'Notes on my reading list this month',
      }),
      buildPost({
        author: 'steadyuser',
        created_utc: nowSeconds - 60 * 60 * 24 * 20,
        name: 't3_old_2',
        selftext: 'Another calm post.',
        subreddit: 'news',
        title: 'Local reporting update and source list',
      }),
    ]);

    const report = buildDetectorReport(post, about, submitted);

    expect(report.clampedScore).toBeLessThan(45);
    expect(report.level).toBe('low');
  });

  it('counts the current post in sampled history metrics', () => {
    const post = buildPost();
    const about: RedditAboutResponse = {
      data: {
        comment_karma: 120,
        created_utc: nowSeconds - 60 * 60 * 24 * 200,
        link_karma: 80,
      },
    };

    const report = buildDetectorReport(post, about, buildSubmitted([post]));

    expect(report.author.meta.sampledPosts).toBe(1);
    expect(report.author.meta.sameSubredditRatio).toBe(1);
  });

  it('adds a warning when the author only has one visible post', () => {
    const post = buildPost();
    const about: RedditAboutResponse = {
      data: {
        comment_karma: 120,
        created_utc: nowSeconds - 60 * 60 * 24 * 200,
        link_karma: 80,
      },
    };

    const report = buildDetectorReport(post, about, buildSubmitted([post]));

    expect(report.author.reasons.join(' ')).toContain(
      'Only one visible post was found in recent history, so history-based signals have a wide margin of error',
    );
    expect(report.author.points).toBeGreaterThanOrEqual(2);
  });

  it('shows 50% same-subreddit ratio when one of two sampled posts matches the current subreddit', () => {
    const post = buildPost({
      subreddit: 'relacionamentos',
      subreddit_name_prefixed: 'r/relacionamentos',
    });
    const about: RedditAboutResponse = {
      data: {
        comment_karma: 120,
        created_utc: nowSeconds - 60 * 60 * 24 * 200,
        link_karma: 80,
      },
    };

    const otherPost = buildPost({
      name: 't3_other',
      subreddit: 'desabafos',
      subreddit_name_prefixed: 'r/desabafos',
      title: 'another post elsewhere',
    });

    const report = buildDetectorReport(post, about, buildSubmitted([post, otherPost]));

    expect(report.author.meta.sampledPosts).toBe(2);
    expect(report.author.meta.sameSubredditRatio).toBe(0.5);
  });

  it('tracks burst posting frequency inside the 24h window', () => {
    const post = buildPost({
      created_utc: nowSeconds,
    });
    const about: RedditAboutResponse = {
      data: {
        comment_karma: 120,
        created_utc: nowSeconds - 60 * 60 * 24 * 200,
        link_karma: 80,
      },
    };

    const recentA = buildPost({
      created_utc: nowSeconds - 60 * 60 * 2,
      name: 't3_recent_a',
      title: 'recent post a',
    });
    const recentB = buildPost({
      created_utc: nowSeconds - 60 * 60 * 6,
      name: 't3_recent_b',
      title: 'recent post b',
    });
    const older = buildPost({
      created_utc: nowSeconds - 60 * 60 * 30,
      name: 't3_old_burst',
      title: 'older post outside window',
    });

    const report = buildDetectorReport(post, about, buildSubmitted([post, recentA, recentB, older]));

    expect(report.author.meta.burstPostCount).toBe(3);
    expect(report.author.reasons.join(' ')).toContain('sampled posts landed within 24h');
  });

  it('counts semantic near-duplicate titles as similar recent titles', () => {
    const post = buildPost({
      subreddit: 'relacionamentos',
      subreddit_name_prefixed: 'r/relacionamentos',
      title: 'O que está acontecendo com os relacionamentos?',
    });
    const about: RedditAboutResponse = {
      data: {
        comment_karma: 120,
        created_utc: nowSeconds - 60 * 60 * 24 * 200,
        link_karma: 80,
      },
    };

    const similarOlderPost = buildPost({
      created_utc: nowSeconds - 60 * 60 * 8,
      name: 't3_semantic_match',
      subreddit: 'desabafos',
      subreddit_name_prefixed: 'r/desabafos',
      title: 'O que esta acontecendo nos relacionamentos de hoje',
    });

    const report = buildDetectorReport(post, about, buildSubmitted([post, similarOlderPost]));

    expect(report.author.meta.repeatedTitleCount).toBe(1);
    expect(report.author.reasons.join(' ')).toContain('very similar recent title');
  });

  it('treats moderator-removed submissions as a separate signal', () => {
    const post = buildPost();
    const about: RedditAboutResponse = {
      data: {
        comment_karma: 120,
        created_utc: nowSeconds - 60 * 60 * 24 * 200,
        link_karma: 80,
      },
    };

    const removedSubmission = buildPost({
      banned_by: 'true',
      name: 't3_removed',
      removal_reason: 'rule violation',
      removed_by_category: 'moderator',
      subreddit: 'desabafos',
      title: 'removed history post',
    });

    const report = buildDetectorReport(post, about, buildSubmitted([removedSubmission]));

    expect(report.author.meta.sampledPosts).toBe(1);
    expect(report.author.meta.moderatorRemovedPosts).toBe(1);
    expect(report.author.reasons.join(' ')).toContain('removed by moderators');
  });

  it('treats accounts younger than six months as new users', () => {
    const post = buildPost({
      author: 'twomonthuser',
      selftext: 'Normal body copy without obvious bait terms.',
      title: 'Looking for grounded relationship advice',
    });
    const about: RedditAboutResponse = {
      data: {
        comment_karma: 450,
        created_utc: nowSeconds - 60 * 60 * 24 * 60,
        link_karma: 320,
      },
    };

    const report = buildDetectorReport(post, about, buildSubmitted([]));

    expect(report.author.reasons.join(' ')).toContain('New account');
    expect(report.author.points).toBeGreaterThanOrEqual(12);
  });

  it('skips author-based scoring when the profile is unavailable', () => {
    const post = buildPost();

    const report = buildDetectorReport(post, null, null);

    expect(report.author.meta.authorSignalsAvailable).toBe(false);
    expect(report.author.meta.linkKarma).toBeNull();
    expect(report.author.meta.sampledPosts).toBeNull();
    expect(report.author.reasons.join(' ')).toContain('account-based signals were excluded');
    expect(report.clampedScore).toBe(report.title.points);
  });

  it('builds per-subreddit post and comment frequency rows', () => {
    const post = buildPost();
    const about: RedditAboutResponse = {
      data: {
        comment_karma: 120,
        created_utc: nowSeconds - 60 * 60 * 24 * 200,
        link_karma: 80,
      },
    };

    const submitted = buildSubmitted([
      buildPost({ name: 't3_a', subreddit: 'technology', subreddit_name_prefixed: 'r/technology' }),
      buildPost({ name: 't3_b', subreddit: 'technology', subreddit_name_prefixed: 'r/technology' }),
      buildPost({ name: 't3_c', subreddit: 'books', subreddit_name_prefixed: 'r/books' }),
    ]);
    const comments = buildComments([
      { subreddit: 'technology', subreddit_name_prefixed: 'r/technology' },
      { subreddit: 'books', subreddit_name_prefixed: 'r/books' },
      { subreddit: 'books', subreddit_name_prefixed: 'r/books' },
      { subreddit: 'books', subreddit_name_prefixed: 'r/books' },
    ]);

    const report = buildDetectorReport(post, about, submitted, comments);
    const technology = report.author.subredditFrequencies.find(
      (entry) => entry.subreddit === 'technology',
    );
    const books = report.author.subredditFrequencies.find((entry) => entry.subreddit === 'books');

    expect(report.author.meta.sampledComments).toBe(4);
    expect(technology).toMatchObject({
      commentCount: 1,
      postCount: 2,
      subredditLabel: 'r/technology',
    });
    expect(technology?.postRatio).toBeCloseTo(2 / 3, 4);
    expect(technology?.commentRatio).toBeCloseTo(1 / 4, 4);
    expect(books).toMatchObject({
      commentCount: 3,
      postCount: 1,
      subredditLabel: 'r/books',
    });
    expect(books?.postRatio).toBeCloseTo(1 / 3, 4);
    expect(books?.commentRatio).toBeCloseTo(3 / 4, 4);
  });
});
