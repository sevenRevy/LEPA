import { FlameIcon, RadarIcon, ShieldAlertIcon } from 'lucide-react';
import { motion } from 'motion/react';

export function PopupApp() {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-none bg-[linear-gradient(180deg,rgba(24,27,35,0.98),rgba(18,20,27,1))] px-3.5 py-3.5 text-foreground"
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <section className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.18em] text-primary uppercase">
            <ShieldAlertIcon className="size-[1rem] shrink-0 text-primary" />
            Extension Ready
          </div>
          <div className="text-[1.65rem] leading-none font-semibold tracking-[-0.03em] text-foreground">
            LEPA
          </div>
          <p className="text-sm leading-5 text-muted-foreground">
            Open a Reddit post page and the detector mounts automatically in the corner.
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <RadarIcon className="size-3.5 shrink-0 text-primary" />
              Live scan
            </div>
            <p className="text-[0.78rem] leading-5 text-muted-foreground">
              Reads the post, author profile, and recent submissions.
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <FlameIcon className="size-3.5 shrink-0 text-primary" />
              Current focus
            </div>
            <p className="text-[0.78rem] leading-5 text-muted-foreground">
              Age, karma, cadence, title repeats, and low-effort title patterns.
            </p>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
