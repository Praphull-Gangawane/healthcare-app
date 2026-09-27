import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingSkeleton } from './LoadingSkeleton';

/** Renders loading / error / empty states for a query, then the content. */
export function QueryState<T>({ query, children, isEmpty, emptyTitle = 'Nothing here yet', emptyMessage, loadingLabel }: { query: UseQueryResult<T>; children: (data: T) => ReactNode; isEmpty?: (data: T) => boolean; emptyTitle?: string; emptyMessage?: ReactNode; loadingLabel?: string }) {
  if (query.isLoading) return <LoadingSkeleton lines={3} label={loadingLabel} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data === undefined) return null;
  if (isEmpty?.(query.data)) return <EmptyState title={emptyTitle} message={emptyMessage} />;
  return <>{children(query.data)}</>;
}
