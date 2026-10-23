import { useQuery } from '@tanstack/react-query';
import type { PublicHealth } from '@arena/contracts';
import { api } from './api';

/** Trạng thái chung (công khai): API, worker, chế độ demo. */
export function usePublicHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api<PublicHealth>('/health'),
    refetchInterval: 10_000,
    retry: 0,
  });
}
