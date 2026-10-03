import { clsx, type ClassValue } from 'clsx';
import { formatCurrency as formatCurrencyImpl } from './currency';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * @deprecated Import formatCurrency from '../lib/currency' instead.
 * Re-exported here for backward compatibility.
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return formatCurrencyImpl(amount, currency as Parameters<typeof formatCurrencyImpl>[1]);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateShort(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function getGradeColor(grade: number): string {
  if (grade >= 16) return 'text-success';
  if (grade >= 14) return 'text-primary-500';
  if (grade >= 12) return 'text-warning';
  if (grade >= 10) return 'text-orange-500';
  return 'text-danger';
}

export function getGradeBadgeClass(grade: number): string {
  if (grade >= 16) return 'badge-success';
  if (grade >= 14) return 'badge-info';
  if (grade >= 12) return 'badge-warning';
  if (grade >= 10) return 'badge-warning';
  return 'badge-danger';
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
