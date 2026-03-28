import { DETECTOR_CONFIG, REDDIT_POST_PATH_PATTERN } from '@/features/reddit-detector/config';
import { buildDetectorReport } from '@/features/reddit-detector/analysis';
import type {
  DetectorReport,
  RedditAboutResponse,
  RedditCommentData,
  RedditListingResponse,
  RedditPostData,
} from '@/features/reddit-detector/types';

class RedditHttpError extends Error {
  status: number;

  constructor(status: number, rawUrl: string) {
    super(`HTTP ${status} for ${rawUrl}`);
    this.name = 'RedditHttpError';
    this.status = status;
  }
}

function safeUrl(rawUrl: string) {
  const url = new URL(rawUrl, globalThis.location?.origin);
  url.searchParams.set('raw_json', '1');
  return url.toString();
}

async function fetchJson<TData>(rawUrl: string): Promise<TData> {
  const requestUrl = safeUrl(rawUrl);
  console.info('[low-effort-post-alarm] fetch:start', requestUrl);

  const response = await fetch(requestUrl, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  console.info('[low-effort-post-alarm] fetch:response', {
    ok: response.ok,
    status: response.status,
    url: requestUrl,
  });

  if (!response.ok) {
    throw new RedditHttpError(response.status, rawUrl);
  }

  return response.json() as Promise<TData>;
}

function isUnavailableAuthorDataError(error: unknown) {
  return error instanceof RedditHttpError && [401, 403, 404].includes(error.status);
}

export function getCanonicalPostUrl(currentUrl = globalThis.location?.href ?? '') {
  const url = new URL(currentUrl);
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname}`;
}

export function shouldRunOnPath(pathname = globalThis.location?.pathname ?? '') {
  return REDDIT_POST_PATH_PATTERN.test(pathname);
}

export async function getPostData(currentUrl = globalThis.location?.href ?? '') {
  const json = await fetchJson<Array<RedditListingResponse<RedditPostData>>>(
    `${getCanonicalPostUrl(currentUrl)}/.json`,
  );

  const post = json[0]?.data?.children?.[0]?.data;
  if (!post) {
    throw new Error('Unexpected post JSON format');
  }

  return post;
}

export function getUserAbout(username: string, origin = globalThis.location?.origin ?? '') {
  return fetchJson<RedditAboutResponse>(
    `${origin}/user/${encodeURIComponent(username)}/about.json`,
  );
}

export function getUserSubmitted(
  username: string,
  origin = globalThis.location?.origin ?? '',
  limit = DETECTOR_CONFIG.recentPostsToInspect,
) {
  return fetchJson<RedditListingResponse<RedditPostData>>(
    `${origin}/user/${encodeURIComponent(username)}/submitted.json?limit=${limit}`,
  );
}

export function getUserComments(
  username: string,
  origin = globalThis.location?.origin ?? '',
  limit = DETECTOR_CONFIG.recentPostsToInspect,
) {
  return fetchJson<RedditListingResponse<RedditCommentData>>(
    `${origin}/user/${encodeURIComponent(username)}/comments.json?limit=${limit}`,
  );
}

async function getAuthorDataOrNull<TData>(
  label: 'about' | 'comments' | 'submitted',
  request: Promise<TData>,
): Promise<TData | null> {
  try {
    return await request;
  } catch (error) {
    if (isUnavailableAuthorDataError(error)) {
      console.warn(`[low-effort-post-alarm] report:${label}:unavailable`, error);
      return null;
    }

    throw error;
  }
}

export async function getCurrentDetectorReport(): Promise<DetectorReport> {
  console.info('[low-effort-post-alarm] report:start');
  const post = await getPostData();
  console.info('[low-effort-post-alarm] report:post', {
    author: post.author,
    subreddit: post.subreddit,
    title: post.title,
  });

  if (!post.author || post.author === '[deleted]') {
    throw new Error('Post author is deleted or unavailable');
  }

  const [about, comments, submitted] = await Promise.all([
    getAuthorDataOrNull('about', getUserAbout(post.author)),
    getAuthorDataOrNull('comments', getUserComments(post.author)),
    getAuthorDataOrNull('submitted', getUserSubmitted(post.author)),
  ]);

  console.info('[low-effort-post-alarm] report:author-data', {
    aboutAvailable: Boolean(about?.data),
    commentsAvailable: comments !== null,
    commentsCount: comments?.data?.children?.length ?? null,
    submittedAvailable: submitted !== null,
    submittedCount: submitted?.data?.children?.length ?? null,
  });

  return buildDetectorReport(post, about, submitted, comments);
}
