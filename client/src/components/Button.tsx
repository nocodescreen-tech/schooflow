import { forwardRef, type ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, leftIcon, rightIcon, disabled, children, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-standard ease-standard active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';
    const variants = {
      primary: 'bg-accent text-[--text-on-accent] hover:bg-accent-hover active:bg-accent-active',
      secondary: 'bg-surface text-ink border border-line hover:bg-surface-hover hover:border-line-strong',
      outline: 'border border-accent-border text-accent-text bg-transparent hover:bg-accent-subtle',
      ghost: 'text-ink-muted hover:bg-surface-hover hover:text-ink',
      danger: 'bg-danger text-[--text-on-accent] hover:brightness-95',
      success: 'bg-success text-[--text-on-accent] hover:brightness-95',
    };
    const sizes = {
      sm: 'min-h-[32px] px-3 text-sm',
      md: 'min-h-[38px] px-4',
      lg: 'min-h-[44px] px-5',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap',
          'transition-[background-color,border-color,color,box-shadow,transform]',
          'duration-standard ease-standard',
          'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
          `border-radius: var(--radius-md)`,
          `min-height: 38px`,
          `padding: 0 var(--space-4)`,
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
