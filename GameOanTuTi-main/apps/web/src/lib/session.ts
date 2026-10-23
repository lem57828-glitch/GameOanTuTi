import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionUser } from '@arena/contracts';
import { api } from './api';

export const sessionKey = ['session'] as const;

export function useSession() {
  const q = useQuery({
    queryKey: sessionKey,
    queryFn: () => api<{ user: SessionUser | null }>('/session'),
    staleTime: 30_000,
  });
  return { user: q.data?.user ?? null, isLoading: q.isLoading, error: q.error };
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ user: null }>('/session', { method: 'DELETE' }),
    onSuccess: () => {
      qc.setQueryData(sessionKey, { user: null });
      void qc.invalidateQueries();
    },
  });
}

export const ROLE_LABEL: Record<SessionUser['role'], string> = {
  student: 'Sinh viên',
  referee: 'Trọng tài',
  admin: 'BTC',
};
