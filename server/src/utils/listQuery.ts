/**
 * Shared helpers for paginated + sortable GET list endpoints.
 *
 * - ?page (default 1), ?limit (default 20, max 100)
 * - ?sortBy (must be in the per-route ALLOWED whitelist) / ?sortOrder (asc|desc)
 */

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

export function getPagination(query: unknown): Pagination {
  const q = (query || {}) as Record<string, unknown>;
  const rawPage = parseInt(String(q.page ?? '1'), 10);
  const rawLimit = parseInt(String(q.limit ?? '20'), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
  return { page, limit, offset: (page - 1) * limit };
}

export interface Sort {
  column: string;
  order: 'ASC' | 'DESC';
}

/**
 * Validate ?sortBy against a whitelist mapping public names -> real columns.
 * Returns null when sortBy/sortOrder is invalid (caller must answer 400).
 */
export function getSort(
  query: unknown,
  allowed: Record<string, string>,
  defaultColumn: string,
  defaultOrder: 'ASC' | 'DESC' = 'DESC'
): Sort | null {
  const q = (query || {}) as Record<string, unknown>;
  const rawOrder = String(q.sortOrder ?? defaultOrder).toUpperCase();
  if (rawOrder !== 'ASC' && rawOrder !== 'DESC') return null;
  const rawBy = q.sortBy === undefined || q.sortBy === null || q.sortBy === '' ? undefined : String(q.sortBy);
  if (!rawBy) return { column: defaultColumn, order: defaultOrder };
  const column = allowed[rawBy];
  if (!column) return null;
  return { column, order: rawOrder };
}

export function pages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}
