import { useEffect, useState } from 'react';

interface QueryRange {
  from: number;
  to: number;
}

interface QueryResult<T> {
  data: T[] | null;
  count: number | null;
  error: unknown;
}

interface PaginatedQueryOptions<T> {
  pageSize: number;
  deps: unknown[];
  queryFn: (range: QueryRange) => PromiseLike<QueryResult<T>>;
}

interface PaginatedQueryResult<T> {
  rows: T[];
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  loading: boolean;
  count: number;
}

export function usePaginatedQuery<T>({
  pageSize,
  deps,
  queryFn,
}: PaginatedQueryOptions<T>): PaginatedQueryResult<T> {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<T[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPage(1);
  }, deps);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, count: total, error } = await queryFn({ from, to });
      if (!active) return;
      if (error) console.error('usePaginatedQuery error:', error);
      setRows(data ?? []);
      setCount(total ?? 0);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ...deps]);

  return {
    rows,
    page,
    setPage,
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
    loading,
    count,
  };
}

export function getPaginationRange(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) result.push('ellipsis');
    result.push(p);
    prev = p;
  }
  return result;
}
