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
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { formatAgeDays } from '@/features/reddit-detector/analysis';
import { getCurrentDetectorReport } from '@/features/reddit-detector/api';
import type { DetectorReport, RedditPostData } from '@/features/reddit-detector/types';

type PanelState = 'warning' | 'neutral' | 'calm';
type ScoreTone = 'high' | 'medium' | 'low' | 'neutral';

function isLowConfidenceReason(reason: string) {
  return (
    reason.includes('Only one visible post was found in recent history') ||
    reason.includes('Author profile is private or unavailable')
  );
}

function scoreVisualTone(
  panelState: PanelState,
  score: number,
  hasSubstantiveFlagReasons: boolean,
): ScoreTone {
  if (panelState === 'neutral') return 'neutral';
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  if (hasSubstantiveFlagReasons) return 'medium';
  return 'low';
}

function scoreChipClass(
  panelState: PanelState,
  score: number,
  approximate: boolean,
  hasSubstantiveFlagReasons: boolean,
) {
  const tone = scoreVisualTone(panelState, score, hasSubstantiveFlagReasons);

  if (tone === 'high') {
    return approximate
      ? 'border border-red-300/20 bg-red-400/10 text-red-100'
      : 'border border-red-300/20 bg-red-400/12 text-red-100';
  }

  if (tone === 'medium') {
    return approximate
      ? 'border border-amber-300/20 bg-amber-400/10 text-amber-100'
      : 'border border-amber-300/20 bg-amber-400/12 text-amber-100';
  }

  if (tone === 'neutral') {
    return approximate
      ? 'border border-slate-300/20 bg-slate-400/10 text-slate-100'
      : 'border border-slate-300/20 bg-slate-400/12 text-slate-100';
  }

  return approximate
    ? 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
    : 'border border-emerald-300/20 bg-emerald-400/12 text-emerald-100';
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

function compactReasonLabel(reason: string) {
  if (reason.startsWith('Very new account')) return reason;
  if (reason.startsWith('New account')) return reason;
  if (reason.includes('Only one visible post was found in recent history')) {
    return '1 visible post (low confidence)';
  }
  if (reason.includes('Author profile is private or unavailable')) {
    return 'Profile hidden (low confidence)';
  }
  if (reason.includes('removed by moderators')) return reason;
  if (reason.startsWith('Very low combined karma')) {
    return reason.replace('combined karma', 'karma');
  }
  if (reason.startsWith('Low combined karma')) {
    return reason.replace('combined karma', 'karma');
  }
  if (reason.includes('sampled posts landed within')) {
    return reason.replace('sampled posts landed within', 'Burst posting in');
  }
  if (reason.startsWith('Repeated similar titles in recent posts')) {
    return reason.replace('Repeated similar titles in recent posts', 'Repeated titles');
  }
  if (reason === 'At least one very similar recent title') return 'Repeated title pattern';
  if (reason.startsWith('Most recent posts heavily concentrated in')) {
    return reason.replace('Most recent posts heavily concentrated in', 'Subreddit concentration');
  }
  if (reason.startsWith('Bait-like phrases found:')) return 'Bait phrases';
  if (reason.startsWith('Low-effort title patterns:')) return 'Low-effort title';
  return reason;
}

function getApproximateScoreRange(score: number) {
  return {
    high: Math.min(100, score + 4),
    low: Math.max(0, score - 4),
  };
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
  const [scoreRangeFrame, setScoreRangeFrame] = useState<'low' | 'high'>('low');
  const [showScoreSummary, setShowScoreSummary] = useState(false);
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
  const lowConfidenceReasons = reasons.filter(isLowConfidenceReason);
  const substantiveReasons = reasons.filter((reason) => !isLowConfidenceReason(reason));
  const historySlides = report ? buildHistorySlides(report) : [];
  const activeHistorySlide = historySlides[historyIndex] ?? null;
  const hasSubstantiveFlagReasons = substantiveReasons.length > 0;
  const hasThinHistorySample =
    report?.author.meta.sampledPosts !== null &&
    report?.author.meta.sampledPosts !== undefined &&
    report.author.meta.sampledPosts <= 1;
  const hasProfileGap = report?.author.meta.authorSignalsAvailable === false;
  const hasHiddenPosts =
    report?.author.meta.submittedAvailable === false || report?.author.meta.sampledPosts === 0;
  const hasScoreMarginOfError = hasThinHistorySample || hasProfileGap;
  const panelState: PanelState = report
    ? hasSubstantiveFlagReasons
      ? 'warning'
      : hasScoreMarginOfError
        ? 'neutral'
        : 'calm'
    : 'warning';
  const isCalmState = panelState === 'calm';
  const isNeutralState = panelState === 'neutral';
  const scoreRange =
    report && hasScoreMarginOfError ? getApproximateScoreRange(report.clampedScore) : null;
  const displayedScore =
    report && scoreRange
      ? scoreRangeFrame === 'low'
        ? scoreRange.low
        : scoreRange.high
      : report?.clampedScore ?? 0;
  const reportTone = report
    ? scoreVisualTone(panelState, report.clampedScore, hasSubstantiveFlagReasons)
    : 'medium';

  useEffect(() => {
    setHistoryIndex((currentIndex) => {
      if (historySlides.length === 0) {
        return 0;
      }

      return Math.min(currentIndex, historySlides.length - 1);
    });
  }, [historySlides.length, report?.post.name]);

  useEffect(() => {
    setShowScoreSummary(false);
  }, [report?.post.name]);

  useEffect(() => {
    if (!scoreRange || scoreRange.low === scoreRange.high) {
      setScoreRangeFrame('low');
      return;
    }

    const timer = globalThis.setInterval(() => {
      setScoreRangeFrame((currentFrame) => (currentFrame === 'low' ? 'high' : 'low'));
    }, 1100);

    return () => {
      globalThis.clearInterval(timer);
    };
  }, [scoreRange?.high, scoreRange?.low]);

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="w-[min(24rem,calc(100vw-1rem))]"
      initial={{ opacity: 0, scale: 0.96, y: 20 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <Card
        className={
          isCalmState
            ? 'overflow-hidden rounded-xl border-emerald-400/15 bg-card/92'
            : isNeutralState
              ? 'overflow-hidden rounded-xl border-slate-400/15 bg-card/92'
              : 'overflow-hidden rounded-xl border-primary/15 bg-card/92'
        }
      >
        <CardHeader
          className={
            isCalmState
              ? 'gap-1.5 px-5 py-3.5 bg-gradient-to-br from-emerald-400/14 via-card/90 to-emerald-500/6'
              : isNeutralState
                ? 'gap-1.5 px-5 py-3.5 bg-gradient-to-br from-slate-400/12 via-card/90 to-slate-500/6'
                : 'gap-1.5 px-5 py-3.5 bg-gradient-to-br from-primary/18 via-card/90 to-accent/14'
          }
        >
          <div className="flex items-center gap-3">
            <div className="space-y-0.5">
              <div
                className={
                  isCalmState
                    ? 'flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-emerald-300 uppercase'
                    : isNeutralState
                      ? 'flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-slate-300 uppercase'
                      : 'flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-primary uppercase'
                }
              >
                <ShieldAlertIcon
                  className={
                    isCalmState
                      ? 'size-4 text-emerald-300'
                      : isNeutralState
                        ? 'size-4 text-slate-300'
                        : 'size-4'
                  }
                />
                LEPA
              </div>
            </div>
            <div className="ml-auto flex items-center justify-end gap-1.5">
              {report ? (
                <Button
                  onClick={() => {
                    setShowScoreSummary((currentValue) => !currentValue);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {showScoreSummary ? 'Hide score' : 'Show score'}
                </Button>
              ) : null}
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
          </div>

          {report && showScoreSummary ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge
                  className={scoreChipClass(
                    panelState,
                    report.clampedScore,
                    hasScoreMarginOfError,
                    hasSubstantiveFlagReasons,
                  )}
                  variant="outline"
                >
                  <motion.span
                    animate={{ opacity: 1, y: 0 }}
                    initial={{ opacity: 0.45, y: 3 }}
                    key={displayedScore}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    {hasScoreMarginOfError ? `~${displayedScore}/100` : `${displayedScore}/100`}
                  </motion.span>
                </Badge>
                <div className="min-w-0 flex-1">
                    <Progress
                      className={
                        hasScoreMarginOfError
                          ? isCalmState
                            ? 'ring-1 ring-emerald-300/10 ring-inset bg-[repeating-linear-gradient(90deg,rgba(52,211,153,0.10)_0_10px,transparent_10px_20px)]'
                            : isNeutralState
                              ? 'ring-1 ring-slate-300/10 ring-inset bg-[repeating-linear-gradient(90deg,rgba(148,163,184,0.12)_0_10px,transparent_10px_20px)]'
                              : 'ring-1 ring-amber-300/10 ring-inset bg-[repeating-linear-gradient(90deg,rgba(251,191,36,0.10)_0_10px,transparent_10px_20px)]'
                        : undefined
                      }
                      indicatorClassName={
                        reportTone === 'high'
                          ? hasScoreMarginOfError
                            ? 'bg-destructive/85'
                            : 'bg-destructive'
                          : reportTone === 'medium'
                            ? hasScoreMarginOfError
                              ? 'bg-primary/85'
                              : 'bg-primary'
                            : reportTone === 'neutral'
                              ? hasScoreMarginOfError
                                ? 'bg-slate-400/85'
                                : 'bg-slate-400'
                              : hasScoreMarginOfError
                                ? 'bg-emerald-400/85'
                                : 'bg-emerald-400'
                      }
                      value={report.clampedScore}
                    />
                </div>
              </div>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="detector-scroll max-h-[78vh] space-y-5 overflow-y-auto pt-4 pb-4">
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
                className="space-y-5"
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
                    <div className="ml-auto flex items-center gap-2">
                      {hasHiddenPosts ? (
                        <Badge
                          className={
                            isNeutralState
                              ? 'gap-1.5 border-slate-300/20 bg-slate-400/10 px-3 py-1.5 text-[0.7rem] leading-none text-slate-100 normal-case'
                              : 'gap-1.5 border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-[0.7rem] leading-none text-amber-100 normal-case'
                          }
                          variant="outline"
                        >
                          <AlertTriangleIcon
                            className={
                              isNeutralState
                                ? 'size-3 shrink-0 text-slate-300'
                                : 'size-3 shrink-0 text-amber-300'
                            }
                          />
                          Profile history limited
                        </Badge>
                      ) : null}
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
                  </div>

                  {activeHistorySlide ? (
                    <motion.div
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-4 rounded-xl bg-background/35 px-5 py-4"
                      initial={{ opacity: 0, x: 14 }}
                      key={activeHistorySlide.id}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={
                            isCalmState && activeHistorySlide.isCurrent
                              ? 'border-emerald-400/25 bg-emerald-400/12 text-emerald-100'
                              : undefined
                          }
                          variant={activeHistorySlide.statusTone}
                        >
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
                    hasSubstantiveFlagReasons
                      ? 'space-y-5 rounded-xl bg-amber-500/6 px-5 py-5'
                      : isNeutralState
                        ? 'space-y-5 rounded-xl bg-slate-400/8 px-5 py-5'
                        : 'space-y-5 rounded-xl bg-emerald-500/6 px-5 py-5'
                  }
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                      {hasSubstantiveFlagReasons ? (
                        <AlertTriangleIcon className="size-4 text-amber-300" />
                      ) : isNeutralState ? (
                        <ShieldAlertIcon className="size-4 text-slate-300" />
                      ) : (
                        <CircleCheckBigIcon className="size-4 text-emerald-300" />
                      )}
                      {hasSubstantiveFlagReasons
                        ? 'Why it was flagged'
                        : isNeutralState
                          ? 'Inconclusive'
                          : 'Looks normal'}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {hasSubstantiveFlagReasons
                        ? 'The score is a blend of language cues and posting history.'
                        : isNeutralState
                          ? 'There is not enough visible author history to make a confident call yet.'
                          : 'Nothing in the title, account signals, or recent posting pattern stands out as suspicious right now.'}
                    </p>
                  </div>

                  {hasSubstantiveFlagReasons ? (
                    <div className="flex flex-wrap gap-2">
                      {reasons.map((reason) => (
                        <Badge
                          className="max-w-full normal-case whitespace-normal text-left leading-5"
                          key={reason}
                          variant="outline"
                        >
                          {compactReasonLabel(reason)}
                        </Badge>
                      ))}
                    </div>
                  ) : isNeutralState ? (
                    lowConfidenceReasons.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {lowConfidenceReasons.map((reason) => (
                          <Badge
                            className="max-w-full normal-case whitespace-normal text-left leading-5"
                            key={reason}
                            variant="outline"
                          >
                            {compactReasonLabel(reason)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Visible history is too limited to classify this post confidently.
                      </p>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No major red flags were found in this post.
                    </p>
                  )}
                </section>

                <Separator />

                <section
                  className={
                    hasHiddenPosts
                      ? 'grid gap-6'
                      : 'grid gap-6 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] md:gap-5'
                  }
                >
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                        <UserRoundIcon
                          className={
                            isCalmState
                              ? 'size-4 text-emerald-300'
                              : isNeutralState
                                ? 'size-4 text-slate-300'
                                : 'size-4 text-primary'
                          }
                        />
                        Account
                      </div>
                      {!report.author.meta.authorSignalsAvailable ? (
                        <CardDescription>
                          Profile history is private or unavailable, so account-based scoring was skipped.
                        </CardDescription>
                      ) : null}
                    </div>

                    <div className="space-y-2.5">
                      <StatRow
                        label="Age"
                        value={displayMetric(report.author.meta.accountAgeDays, formatAgeDays)}
                      />
                      <StatRow
                        label="Total karma"
                        value={displayMetric(report.author.meta.combinedKarma)}
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
                        label="Current post score"
                        value={displayMetric(report.post.score ?? null)}
                      />
                    </div>
                  </div>

                  {!hasHiddenPosts ? (
                    <>
                      <div
                        aria-hidden="true"
                        className={
                          isCalmState
                            ? 'hidden w-px self-stretch rounded-full bg-emerald-400/15 md:block'
                            : isNeutralState
                              ? 'hidden w-px self-stretch rounded-full bg-slate-400/15 md:block'
                              : 'hidden w-px self-stretch rounded-full bg-border/55 md:block'
                        }
                      />

                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                            <Clock3Icon
                              className={
                                isCalmState
                                  ? 'size-4 text-emerald-300'
                                  : isNeutralState
                                    ? 'size-4 text-slate-300'
                                    : 'size-4 text-primary'
                              }
                            />
                            Posting behavior
                          </div>
                        </div>

                        <div className="space-y-2.5">
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
                    </>
                  ) : null}
                </section>

              </motion.div>
            ) : null}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
