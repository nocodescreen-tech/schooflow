import { motion, useReducedMotion } from 'motion/react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { staggerItem } from '../lib/motion';

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  trend?: number;
  trendLabel?: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  color?: string;
  prefix?: string;
  suffix?: string;
}

const TONE_CLASS: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'bg-surface-hover text-text-secondary',
  accent: 'bg-accent-subtle text-accent-text',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  info: 'bg-info-soft text-info-text',
};

function useCountUp(target: number, reduce: boolean) {
  const [count, setCount] = useState(reduce ? target : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduce) {
      setCount(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const from = fromRef.current;

    const tick = (now: number) => {
      const t = Math.min((now - start) / 700, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(from + (target - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduce]);

  return count;
}

export default function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  tone = 'neutral',
  color,
  prefix = '',
  suffix = '',
}: StatCardProps) {
  const reduce = useReducedMotion();
  const animatedValue = useCountUp(value, Boolean(reduce));

  return (
    <motion.div
      variants={staggerItem}
      className="card card-hover p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-muted">{title}</p>
          <p className="tabular-nums mt-1 text-h1 text-text">
            {prefix}
            {animatedValue.toLocaleString('fr-FR')}
            {suffix}
          </p>
          {trend !== undefined && (
            <div className="mt-2 flex items-center gap-1.5">
              {trend >= 0 ? (
                <TrendingUp className="w-4 h-4 text-success" aria-hidden />
              ) : (
                <TrendingDown className="w-4 h-4 text-danger" aria-hidden />
              )}
              <span className={`text-sm font-medium ${trend >= 0 ? 'text-success' : 'text-danger'}`}>
                {trend >= 0 ? '+' : ''}
                {trend}%
              </span>
              {trendLabel && <span className="text-xs text-text-muted">{trendLabel}</span>}
            </div>
          )}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color ?? TONE_CLASS[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </motion.div>
  );
}