export type ScoreLevel = 'low' | 'medium' | 'high';

export interface RedditPostData {
  author: string;
  banned_by?: string | null;
  created_utc?: number;
  crosspost_parent?: string;
  mod_reason_title?: string | null;
  name?: string;
  over_18?: boolean;
  permalink?: string;
  removed_by_category?: string | null;
  removal_reason?: string | null;
  selftext?: string;
  subreddit: string;
  subreddit_name_prefixed?: string;
  title: string;
}

export interface RedditAboutData {
  comment_karma: number;
  created_utc?: number;
  link_karma: number;
}

export interface RedditListingChild<TData> {
  data: TData;
  kind?: string;
}

export interface RedditListingResponse<TData> {
  data?: {
    children?: Array<RedditListingChild<TData>>;
  };
}

export interface RedditAboutResponse {
  data?: RedditAboutData;
}

export interface MatchResult {
  count: number;
  hits: string[];
}

export interface TitleBodyAnalysis {
  baitHits: string[];
  lowEffortHits: string[];
  points: number;
  reasons: string[];
}

export interface AuthorMeta {
  accountAgeDays: number | null;
  authorSignalsAvailable: boolean;
  aboutAvailable: boolean;
  burstPostCount: number | null;
  combinedKarma: number | null;
  commentKarma: number | null;
  linkKarma: number | null;
  moderatorRemovedPosts: number | null;
  postsPerDay: number | null;
  repeatedShortWindowCount: number | null;
  repeatedTitleCount: number | null;
  sampledPosts: number | null;
  sameSubredditRatio: number | null;
  submittedAvailable: boolean;
}

export interface AuthorAnalysis {
  meta: AuthorMeta;
  points: number;
  reasons: string[];
}

export interface DetectorReport {
  about: RedditAboutResponse | null;
  author: AuthorAnalysis;
  clampedScore: number;
  level: ScoreLevel;
  post: RedditPostData;
  submitted: RedditListingResponse<RedditPostData> | null;
  title: TitleBodyAnalysis;
  totalScore: number;
  verdict: string;
}
