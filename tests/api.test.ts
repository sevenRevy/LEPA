import { getCanonicalPostUrl, shouldRunOnPath } from '@/features/reddit-detector/api';

describe('reddit detector route gating', () => {
  it('only runs on Reddit post routes', () => {
    expect(shouldRunOnPath('/r/technology/comments/abc123/example-post')).toBe(true);
    expect(shouldRunOnPath('/r/books/comments/xyz987')).toBe(true);
  });

  it('skips Reddit feed, profile, and subreddit listing routes', () => {
    expect(shouldRunOnPath('/')).toBe(false);
    expect(shouldRunOnPath('/r/popular/')).toBe(false);
    expect(shouldRunOnPath('/news/')).toBe(false);
    expect(shouldRunOnPath('/explore/')).toBe(false);
    expect(shouldRunOnPath('/user/spez/')).toBe(false);
    expect(shouldRunOnPath('/r/technology/')).toBe(false);
    expect(shouldRunOnPath('/r/technology/top/')).toBe(false);
  });

  it('strips trailing slashes before building the canonical JSON URL', () => {
    expect(
      getCanonicalPostUrl('https://www.reddit.com/r/technology/comments/abc123/example-post///'),
    ).toBe('https://www.reddit.com/r/technology/comments/abc123/example-post');
  });
});
