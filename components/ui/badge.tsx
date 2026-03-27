import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase transition-colors',
  {
    variants: {
      variant: {
        default: 'border-primary/30 bg-primary/15 text-primary',
        secondary: 'border-secondary/40 bg-secondary/35 text-secondary-foreground',
        destructive: 'border-destructive/30 bg-destructive/15 text-red-100',
        outline: 'border-border/70 bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type BadgeProps = React.ComponentProps<'div'> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
