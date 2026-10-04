import { cn } from '../lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
  className?: string;
}

/**
 * Status badges (§66) — every colour pair is verified at 4.5:1 by
 * scripts/check-contrast.mjs. The previous amber-on-amber badges failed
 * at 2.07:1; that is why the *text* role is much darker than the
 * decoration role.
 */
export function Badge({
  children,
  variant = 'neutral',
  className,
}: BadgeProps) {
  const variants = {
    success: 'bg-success-soft text-success-text border-success-border',
    warning: 'bg-warning-soft text-warning-text border-warning-border',
    danger: 'bg-danger-soft text-danger-text border-danger-border',
    info: 'bg-info-soft text-info-text border-info-border',
    neutral: 'bg-surface-hover text-ink-secondary border-line',
    accent: 'bg-accent-subtle text-accent-text border-accent-border',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium whitespace-nowrap',
        'font-size: var(--text-xs);',
        'line-height: 1.4;',
        'padding: 2px var(--space-2);',
        'border-radius: var(--radius-sm);',
        'border: 1px solid transparent;',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
