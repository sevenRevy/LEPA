import { startTransition, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckBigIcon,
  Clock3Icon,
  ExternalLinkIcon,
  RefreshCcwIcon,
  ShieldAlertIcon,
  SparklesIcon,
  UserRoundIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { VariantProps } from 'class-variance-authority';

import { Badge, badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { formatAgeDays } from '@/features/reddit-detector/analysis';
import { getCurrentDetectorReport } from '@/features/reddit-detector/api';
import type { DetectorReport, RedditPostData } from '@/features/reddit-detector/types';

function scoreTone(score: number) {
  if (score >= 70) return 'destructive';
  if (score >= 45) return 'secondary';
  return 'default';
}

function percentage(value: number | null) {
  if (value === null) return 'Skipped';
  return `${Math.round(value * 100)}%`;
}

function displayMetric(value: number | null, formatter?: (value: number) => string) {
  if (value === null) return 'Skipped';
  return formatter ? formatter(value) : String(value);
}

function displayPostFrequency(count: number | null) {
  if (count === null) return 'Skipped';
  if (count >= 6) return 'High';
  if (count >= 3) return 'Medium';
  return 'Low';
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

function buildHistorySlides(report: DetectorReport) {
  const submittedPosts =
    report.submitted?.data?.children
      ?.filter((child) => child.kind === 't3')
      .map((child) => child.data)
      .filter((post): post is RedditPostData => Boolean(post) && Boolean(post.title)) ?? [];

  const currentPost = submittedPosts.find((post) => post.name === report.post.name) ?? report.post;
  const orderedPosts = [
    currentPost,
    ...submittedPosts.filter((post) => post.name !== currentPost.name),
  ];

  return orderedPosts.map((post) => {
    const current = post.name === report.post.name;
    const removed = isModeratorRemoved(post);
    const deleted = isDeletedPost(post);
    const statusTone: VariantProps<typeof badgeVariants>['variant'] =
      current ? 'default' : removed ? 'destructive' : 'outline';

    return {
      href: post.permalink ? `${globalThis.location.origin}${post.permalink}` : null,
      id: post.name ?? `${post.title}-${post.created_utc ?? 0}`,
      isCurrent: current,
      statusLabel: current ? 'Current' : removed ? 'Removed' : deleted ? 'Deleted' : 'Visible',
      statusTone,
      subreddit: post.subreddit_name_prefixed ?? `r/${post.subreddit}`,
      title: resolveHistoryTitle(post, removed, deleted),
      when: formatHistoryAge(post.created_utc),
    };
  });
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

export function DetectorPanel() {
  const [historyIndex, setHistoryIndex] = useState(0);
  const query = useQuery({
    queryKey: ['reddit-detector', globalThis.location.pathname],
    queryFn: getCurrentDetectorReport,
  });

  useEffect(() => {
    console.info('[low-effort-post-alarm] panel:query-state', {
      hasData: Boolean(query.data),
      isError: query.isError,
      isPending: query.isPending,
      status: query.status,
    });
  }, [query.data, query.isError, query.isPending, query.status]);

  useEffect(() => {
    if (query.error) {
      console.error('[low-effort-post-alarm] panel:error', query.error);
    }
  }, [query.error]);

  const report = query.data;
  const reasons = report ? [...report.title.reasons, ...report.author.reasons].slice(0, 12) : [];
  const historySlides = report ? buildHistorySlides(report) : [];
  const activeHistorySlide = historySlides[historyIndex] ?? null;
  const hasFlagReasons = reasons.length > 0;

  useEffect(() => {
    setHistoryIndex((currentIndex) => {
      if (historySlides.length === 0) {
        return 0;
      }

      return Math.min(currentIndex, historySlides.length - 1);
    });
  }, [historySlides.length, report?.post.name]);

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="w-[min(24rem,calc(100vw-1rem))]"
      initial={{ opacity: 0, scale: 0.96, y: 20 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <Card className="overflow-hidden border-primary/15 bg-card/92">
        <CardHeader className="gap-3 bg-gradient-to-br from-primary/18 via-card/90 to-accent/14">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[0.72rem] font-semibold tracking-[0.22em] text-primary uppercase">
                <ShieldAlertIcon className="size-4" />
                Low-Effort Post Alarm
              </div>
              <CardTitle className="text-lg">Reddit bait detector</CardTitle>
            </div>
            <Button
              aria-label="Refresh analysis"
              onClick={() => {
                startTransition(() => {
                  void query.refetch();
                });
              }}
              size="icon"
              variant="outline"
            >
              <RefreshCcwIcon className="size-4" />
            </Button>
          </div>

          {report ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant={scoreTone(report.clampedScore)}>{report.clampedScore}/100</Badge>
                <div className="min-w-0 flex-1">
                  <Progress
                    indicatorClassName={
                      report.clampedScore >= 70
                        ? 'bg-destructive'
                        : report.clampedScore >= 45
                          ? 'bg-primary'
                          : 'bg-emerald-400'
                    }
                    value={report.clampedScore}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="detector-scroll max-h-[72vh] space-y-4 overflow-y-auto pt-5 pb-5">
          <AnimatePresence mode="wait">
            {query.isPending ? (
              <motion.div
                key="loading"
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
                exit={{ opacity: 0, y: -8 }}
                initial={{ opacity: 0, y: 12 }}
              >
                <div className="rounded-xl border border-border/60 bg-muted/35 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <SparklesIcon className="size-4 text-primary" />
                    Pulling Reddit JSON endpoints...
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Sampling the current post, author profile, and recent submissions.
                  </p>
                </div>
              </motion.div>
            ) : null}

            {query.isError ? (
              <motion.div
                key="error"
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
                exit={{ opacity: 0, y: -8 }}
                initial={{ opacity: 0, y: 12 }}
              >
                <div className="rounded-xl border border-destructive/35 bg-destructive/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-100">
                    <AlertTriangleIcon className="size-4" />
                    Could not analyze this post
                  </div>
                  <p className="mt-2 text-sm text-red-100/80">
                    {query.error instanceof Error ? query.error.message : 'Unexpected error'}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Reddit can rate-limit JSON requests, especially when the page is reloaded rapidly.
                </p>
              </motion.div>
            ) : null}

            {report ? (
              <motion.div
                key="report"
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
                exit={{ opacity: 0, y: -8 }}
                initial={{ opacity: 0, y: 12 }}
              >
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <div className="inline-flex items-center gap-1">
                      <UserRoundIcon className="size-3.5" />
                      u/{report.post.author}
                    </div>
                    {historySlides.length > 1 ? (
                      <div className="inline-flex items-center gap-1 font-mono">
                        <Button
                          aria-label="Show previous post"
                          className="size-7"
                          disabled={historyIndex === 0}
                          onClick={() => setHistoryIndex((currentIndex) => Math.max(0, currentIndex - 1))}
                          size="icon"
                          variant="ghost"
                        >
                          <ChevronLeftIcon className="size-3.5" />
                        </Button>
                        <span className="min-w-8 text-center">
                          {historyIndex + 1}/{historySlides.length}
                        </span>
                        <Button
                          aria-label="Show next post"
                          className="size-7"
                          disabled={historyIndex === historySlides.length - 1}
                          onClick={() =>
                            setHistoryIndex((currentIndex) =>
                              Math.min(historySlides.length - 1, currentIndex + 1),
                            )
                          }
                          size="icon"
                          variant="ghost"
                        >
                          <ChevronRightIcon className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {activeHistorySlide ? (
                    <motion.div
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-3 rounded-2xl bg-background/35 px-4 py-4"
                      initial={{ opacity: 0, x: 14 }}
                      key={activeHistorySlide.id}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={activeHistorySlide.statusTone}>
                          {activeHistorySlide.statusLabel}
                        </Badge>
                        <Badge variant="outline">{activeHistorySlide.subreddit}</Badge>
                        <span className="text-xs text-muted-foreground">{activeHistorySlide.when}</span>
                      </div>

                      <p className="text-sm font-medium leading-6 text-foreground">
                        {activeHistorySlide.title}
                      </p>

                      {activeHistorySlide.href ? (
                        <a
                          className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                          href={activeHistorySlide.href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open post
                          <ExternalLinkIcon className="size-3.5" />
                        </a>
                      ) : null}
                    </motion.div>
                  ) : null}
                </section>

                <Separator />

                <section
                  className={
                    hasFlagReasons
                      ? 'space-y-4 rounded-2xl bg-amber-500/6 px-4 py-4'
                      : 'space-y-4 rounded-2xl bg-emerald-500/6 px-4 py-4'
                  }
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                      {hasFlagReasons ? (
                        <AlertTriangleIcon className="size-4 text-amber-300" />
                      ) : (
                        <CircleCheckBigIcon className="size-4 text-emerald-300" />
                      )}
                      {hasFlagReasons ? 'Why it was flagged' : 'Looks normal'}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {hasFlagReasons
                        ? 'The score is a blend of language cues and posting history.'
                        : 'Nothing in the title, account signals, or recent posting pattern stands out as suspicious right now.'}
                    </p>
                  </div>

                  {hasFlagReasons ? (
                    <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
                      {reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No major red flags were found in this post.
                    </p>
                  )}
                </section>

                <Separator className="mt-2" />

                <section className="grid gap-8 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] md:gap-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                        <UserRoundIcon className="size-4 text-primary" />
                        Account
                      </div>
                      {!report.author.meta.authorSignalsAvailable ? (
                        <CardDescription>
                          Profile history is private or unavailable, so account-based scoring was skipped.
                        </CardDescription>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <StatRow
                        label="Age"
                        value={displayMetric(report.author.meta.accountAgeDays, formatAgeDays)}
                      />
                      <StatRow
                        label="Posts karma"
                        value={displayMetric(report.author.meta.linkKarma)}
                      />
                      <StatRow
                        label="Comment karma"
                        value={displayMetric(report.author.meta.commentKarma)}
                      />
                      <StatRow
                        label="Total karma"
                        value={displayMetric(report.author.meta.combinedKarma)}
                      />
                    </div>
                  </div>

                  <div
                    aria-hidden="true"
                    className="hidden w-px self-stretch rounded-full bg-border/55 md:block"
                  />

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <Clock3Icon className="size-4 text-primary" />
                      Posting behavior
                    </div>

                    <div className="space-y-3">
                      <StatRow
                        label="Total posts"
                        value={displayMetric(report.author.meta.sampledPosts)}
                      />
                      <StatRow
                        label="Mod-removed posts"
                        value={displayMetric(report.author.meta.moderatorRemovedPosts)}
                      />
                      <StatRow
                        label="Posts/day"
                        value={displayMetric(report.author.meta.postsPerDay, (value) =>
                          value.toFixed(2),
                        )}
                      />
                      <StatRow
                        label="Post frequency"
                        value={displayPostFrequency(report.author.meta.burstPostCount)}
                      />
                      <StatRow
                        label="Same-subreddit ratio"
                        value={percentage(report.author.meta.sameSubredditRatio)}
                      />
                    </div>
                  </div>
                </section>

              </motion.div>
            ) : null}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
