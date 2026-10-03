import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';

/**
 * OtpInput — the single reusable verification input (§13, §40).
 *
 * One accessible field, visually segmented into six boxes. A single input is
 * what makes paste, auto-fill and screen readers work without special-casing;
 * the boxes are a presentation layer over it, not six separate inputs.
 *
 * Behaviour (§15, §16):
 *  - typing a digit advances focus automatically;
 *  - Backspace on an empty box moves back;
 *  - pasting a 6-digit code distributes it across every box at once;
 *  - the OS numeric keypad is requested on mobile.
 *
 * Motion is limited to a border/scale nudge per digit and a small shake on a
 * wrong code (§14) — never decorative.
 */
interface OtpInputProps {
  length?: number;
  onComplete: (code: string) => void;
  onDigitChange?: (digit: string, index: number) => void;
  disabled?: boolean;
  /** Triggers the error shake. Increment to replay. */
  errorKey?: number;
  autoFocus?: boolean;
  className?: string;
}

export default function OtpInput({
  length = 6,
  onComplete,
  onDigitChange,
  disabled = false,
  errorKey = 0,
  autoFocus = true,
  className,
}: OtpInputProps) {
  const reduce = useReducedMotion();
  const [digits, setDigits] = useState<string[]>(Array(length).fill(''));
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus on mount (§16).
  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  // Replay the error shake whenever errorKey changes (§14).
  useEffect(() => {
    if (errorKey === 0 || reduce) return;
    setShake(true);
    const t = setTimeout(() => setShake(false), 300);
    return () => clearTimeout(t);
  }, [errorKey, reduce]);

  const setDigit = (index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    onDigitChange?.(value, index);
  };

  const handleChange = (raw: string) => {
    // Accept a full paste or a single typed digit; keep only digits.
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) return;

    if (cleaned.length > 1) {
      // Paste: distribute across the boxes (§15).
      const next = Array(length).fill('');
      for (let i = 0; i < Math.min(cleaned.length, length); i++) next[i] = cleaned[i];
      setDigits(next);
      const code = next.join('');
      if (code.length === length) onComplete(code);
      return;
    }

    setDigit(focusedIndex, cleaned);
    if (focusedIndex < length - 1) setFocusedIndex(focusedIndex + 1);

    const next = [...digits];
    next[focusedIndex] = cleaned;
    if (next.join('').length === length) onComplete(next.join(''));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[focusedIndex]) {
        setDigit(focusedIndex, '');
      } else if (focusedIndex > 0) {
        setDigit(focusedIndex - 1, '');
        setFocusedIndex(focusedIndex - 1);
      }
    } else if (e.key === 'ArrowLeft' && focusedIndex > 0) {
      setFocusedIndex(focusedIndex - 1);
    } else if (e.key === 'ArrowRight' && focusedIndex < length - 1) {
      setFocusedIndex(focusedIndex + 1);
    }
  };

  const focusInput = () => inputRef.current?.focus();

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      role="group"
      aria-label="Code de vérification à 6 chiffres"
    >
      {/* The real input: visually hidden but fully accessible. */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        value={digits.join('')}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocusedIndex((i) => (digits[i] ? i + 1 : i))}
        disabled={disabled}
        aria-label="Code de vérification"
        className="absolute inset-0 h-full w-full opacity-0"
        style={{ fontSize: '16px' }} /* prevents iOS zoom on focus */
      />

      {/* Visual boxes. Clicking any of them focuses the real input. */}
      <div
        className={cn('flex gap-2 sm:gap-3', shake && !reduce && 'animate-[shake_0.3s_ease-in-out]')}
        onClick={focusInput}
      >
        {digits.map((digit, i) => {
          const isFocused = i === focusedIndex && !disabled;
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{
                scale: digit && !reduce ? 1.04 : 1,
                borderColor: isFocused
                  ? 'var(--accent)'
                  : digit
                    ? 'var(--border-strong)'
                    : 'var(--border)',
              }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className={cn(
                'flex h-12 w-10 items-center justify-center rounded-xl border-2 bg-surface text-h3 font-semibold text-ink sm:h-14 sm:w-12',
                disabled && 'opacity-50'
              )}
              aria-hidden
            >
              {digit}
            </motion.div>
          );
        })}
      </div>

      {/* Screen-reader announcement of progress. */}
      <span className="sr-only" aria-live="polite">
        {digits.filter(Boolean).length} chiffre(s) saisi(s) sur {length}
      </span>
    </div>
  );
}