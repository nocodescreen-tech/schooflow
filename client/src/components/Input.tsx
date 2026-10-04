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
  ({ className, label, error, hint, leftIcon, rightIcon, disabled, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="input-label" htmlFor={props.id}>
            {props.label}
          </label>
        )}
        <div className="relative">
          {props.leftIcon && (
            <span className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden>
              {props.leftIcon}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              'w-full text-body text-ink bg-surface border border-line',
              'placeholder:text-ink-placeholder',
              'transition-[border-color,box-shadow] duration-fast ease-standard',
              'focus:outline-none focus:border-accent',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              error && 'input-error'
            )}
            disabled={disabled}
            className={cn('input-field', className)}
            {...props}
          />
          {props.rightIcon && (
            <span className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden>
              {props.rightIcon}
            </span>
          )}
        </div>
        {props.error && (
          <p className="mt-1.5 text-xs text-danger-text" role="alert">{props.error}</p>
        )}
        {props.hint && !props.error && (
          <p className="mt-1.5 text-xs text-ink-muted">{props.hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };