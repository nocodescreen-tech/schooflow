import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchKeys: (keyof T)[];
  searchPlaceholder?: string;
  pageSize?: number;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  /** Controlled search value (e.g. URL-synced). Falls back to internal state when omitted. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Bulk selection. `rowId` must be stable and unique per row. */
  selectable?: boolean;
  rowId?: (item: T) => string;
  selectedIds?: Set<string>;
  onToggleRow?: (id: string) => void;
  /** Called with the current page ids when the header checkbox is toggled. */
  onToggleSelectAll?: (ids: string[], checked: boolean) => void;
}

export default function DataTable<T extends object>({
  data,
  columns,
  searchKeys,
  searchPlaceholder = 'Rechercher...',
  pageSize = 10,
  onRowClick,
  emptyMessage = 'Aucune donnée trouvée',
  searchValue,
  onSearchChange,
  selectable = false,
  rowId,
  selectedIds,
  onToggleRow,
  onToggleSelectAll,
}: DataTableProps<T>) {
  const [internalSearch, setInternalSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const search = searchValue ?? internalSearch;
  const setSearch = (v: string) => {
    if (onSearchChange) onSearchChange(v);
    else setInternalSearch(v);
    setCurrentPage(1);
  };

  const filteredData = useMemo(() => {
    if (!search) return data;
    const lowerSearch = search.toLowerCase();
    return data.filter((item) =>
      searchKeys.some((key) => {
        const value = item[key];
        return value && String(value).toLowerCase().includes(lowerSearch);
      })
    );
  }, [data, search, searchKeys]);

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, filteredData.length);

  const showSelection = selectable && rowId && selectedIds && onToggleRow && onToggleSelectAll;
  const pageIds = showSelection ? paginatedData.map((item) => rowId(item)) : [];
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds?.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds?.has(id));

  return (
    <div className="space-y-4">
      <div className="relative no-print">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          className="input-field pl-10"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border dark:border-white/10">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
              {showSelection && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allPageSelected && somePageSelected;
                    }}
                    onChange={(e) => onToggleSelectAll!(pageIds, e.target.checked)}
                    aria-label="Tout sélectionner"
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border dark:divide-white/5">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (showSelection ? 1 : 0)} className="px-4 py-12 text-center text-muted dark:text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => (
                <motion.tr
                  key={index}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    'hover:bg-gray-50 dark:hover:bg-white/5 transition-colors',
                    onRowClick && 'cursor-pointer'
                  )}
                >
                  {showSelection && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!selectedIds?.has(rowId!(item))}
                        onChange={() => onToggleRow!(rowId!(item))}
                        aria-label="Sélectionner cette ligne"
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3 text-sm', col.className)}>
                      {col.render
                        ? col.render(item)
                        : String((item as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {startItem}-{endItem} sur {filteredData.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-sm font-medium">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
