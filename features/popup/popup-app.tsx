import { ExternalLinkIcon, FlameIcon, ShieldAlertIcon } from 'lucide-react';
import { motion } from 'motion/react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export function PopupApp() {
  return (
    <div className="min-h-screen bg-transparent p-4 text-foreground">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
        initial={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
      >
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-primary/20 via-card/95 to-accent/12">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              <ShieldAlertIcon className="size-4" />
              Extension Ready
            </div>
            <CardTitle className="text-lg">Low-Effort Post Alarm</CardTitle>
            <CardDescription>
              Open a Reddit post page and the detector panel will mount automatically in the corner.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">WXT</Badge>
              <Badge variant="outline">React</Badge>
              <Badge variant="outline">TanStack Query</Badge>
              <Badge variant="outline">Motion</Badge>
              <Badge variant="outline">shadcn/ui</Badge>
            </div>

            <Separator />

            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                The panel samples the post JSON, author profile JSON, and recent submissions JSON to
                estimate whether the post looks low-effort, spammy, or ragebait-heavy.
              </p>
              <p>
                Use <code className="rounded bg-muted px-1.5 py-0.5 font-mono">npm run dev:chrome</code> or{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">npm run dev:firefox</code>{' '}
                to launch the extension runner for the browser you want.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlameIcon className="size-4 text-primary" />
              What it checks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Account age, combined karma, posting cadence, repeated titles, short-window posting, and bait phrases.</p>
            <Button asChild className="w-full" variant="outline">
              <a href="https://www.reddit.com/dev/api/" rel="noreferrer" target="_blank">
                Reddit API docs
                <ExternalLinkIcon data-icon="inline-end" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
