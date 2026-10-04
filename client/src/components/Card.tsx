import { forwardRef, type ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  inset?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}

export const Card = ({
  children,
  className,
  hover = false,
  inset = false,
  interactive = false,
  onClick,
  className: classNameProp,
}: CardProps) => {
  return (
    <div
      className={cn(
        'bg-surface-raised border border-line',
        'rounded-[var(--radius-xl)]',
        'shadow-sm',
        'transition-[transform,box-shadow,border-color] duration-medium ease-standard',
        className
      )}
    >
      {children}
    </div>
  );
}

export const CardHover = ({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) => {
  return (
    <div
      className={cn(
        'bg-surface-raised border border-line',
        'rounded-[var(--radius-xl)]',
        'shadow-sm',
        'transition-[transform,box-shadow,border-color] duration-medium ease-standard',
        'hover:-translate-y-[2px] hover:border-[var(--border-strong)] hover:shadow-md',
        'cursor-pointer'
      )}
    >
      {children}
    </div>
  );
};

export const CardInset = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        'bg-surface-inset border border-line',
        'rounded-[var(--radius-lg)]',
        className
      )}
    >
      {children}
    </div>
  );
};

export const CardInteractive = ({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) => {
  return (
    <div
      className={cn(
        'bg-surface-raised border border-line',
        'rounded-[var(--radius-xl)]',
        'shadow-sm',
        'transition-[transform,box-shadow,border-color] duration-medium ease-standard',
        'hover:-translate-y-[2px] hover:border-[var(--border-strong)] hover:shadow-md',
        'cursor-pointer',
      )}
    >
      {children}
    </div>
  );
};