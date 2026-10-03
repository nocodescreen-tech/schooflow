import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import Tooltip from './Tooltip';
import { cn } from '../lib/utils';

export interface RowActionItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface RowActionsProps {
  items: RowActionItem[];
  label?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  /** true when the menu had to flip above the trigger */
  openUp: boolean;
}

const MENU_WIDTH = 200;
const ESTIMATED_HEIGHT = 220;

/**
 * Per-row ⋮ action menu.
 *
 * The menu is rendered through a portal on <body> and positioned with fixed
 * coordinates. This is required, not cosmetic: these tables live inside
 * `overflow-x-auto` wrappers, and an absolutely-positioned dropdown is
 * *clipped* by that overflow — it appeared "hidden" instead of opening.
 * A portal escapes the clipping context entirely.
 */
export default function RowActions({ items, label = 'Actions' }: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const computePosition = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    // Flip above the button when there is not enough room below.
    const openUp = rect.bottom + ESTIMATED_HEIGHT > window.innerHeight;
    const spaceAbove = rect.top;
    if (openUp && spaceAbove < ESTIMATED_HEIGHT) {
      // Not enough space either way: pin it to the viewport bottom.
      setPosition({ top: Math.max(8, window.innerHeight - ESTIMATED_HEIGHT - 8), left: rect.right - MENU_WIDTH, openUp: true });
      return;
    }
    const top = openUp ? rect.top - 8 : rect.bottom + 8;
    // Keep the menu inside the viewport horizontally.
    const rawLeft = rect.right - MENU_WIDTH;
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - MENU_WIDTH - 8));
    setPosition({ top, left, openUp });
  };

  const openMenu = () => {
    computePosition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const reposition = () => computePosition();
    const onPointerDown = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onScrollOrResize = () => computePosition();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open]);

  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    openMenu();
  };

  if (items.length === 0) return null;

  const menu = (
    <AnimatePresence>
      {open && position && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95, y: position.openUp ? 4 : -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: position.openUp ? 4 : -4 }}
          transition={{ duration: 0.12 }}
          role="menu"
          // z-[200] sits above modals (100) and the sidebar (50).
          className="fixed z-[200] min-w-[200px] card p-1.5 shadow-xl"
          style={{ top: position.top, left: position.left }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                item.danger
                  ? 'text-danger hover:bg-red-50 dark:hover:bg-red-500/10'
                  : 'text-text dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={rootRef} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <Tooltip label={label}>
        <button
          ref={btnRef}
          type="button"
          onClick={toggle}
          className="btn-icon"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </Tooltip>
      {typeof document !== 'undefined' && createPortal(menu, document.body)}
    </div>
  );
}
