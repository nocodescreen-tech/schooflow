import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

interface Pos {
  top: number;
  left: number;
}

/**
 * Accessible tooltip for icon-only controls.
 * The label is exposed to assistive tech via aria-label, so the tooltip is
 * purely visual reinforcement and the control stays usable without hover.
 *
 * Rendered through a portal: these controls sit inside scrollable tables
 * (`overflow-x-auto`), where an absolutely-positioned tooltip is clipped away.
 */
export default function Tooltip({
  label,
  children,
  side = 'top',
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!visible) {
      setPos(null);
      return;
    }
    const place = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const estimated = 28;
      const top = side === 'top' ? r.top - estimated - 6 : r.bottom + 6;
      // Clamp horizontally so the bubble never leaves the viewport.
      const left = Math.max(8, Math.min(r.left + r.width / 2, window.innerWidth - 8));
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [visible, side]);

  const bubble = pos && (
    <span
      role="tooltip"
      className="pointer-events-none fixed z-[210] -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-gray-900"
      style={{ top: pos.top, left: pos.left }}
    >
      {label}
    </span>
  );

  return (
    <span
      ref={wrapperRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {typeof document !== 'undefined' && bubble && createPortal(bubble, document.body)}
    </span>
  );
}
