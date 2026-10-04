import { forwardRef, type ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, disabled, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="input-label" htmlFor={id}>
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden>
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            className={cn(
              'w-full text-body text-ink bg-surface border border-line',
              'placeholder:text-ink-placeholder',
              'transition-[border-color,box-shadow] duration-fast ease-standard',
              'focus:outline-none focus:border-accent',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              error && 'input-error',
              className
            )}
            disabled={disabled}
            {...props}
          />
          {rightIcon && (
            <span className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden>
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-danger-text" role="alert">{error}</p>
        )}
        {hint && !error && (
          <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
