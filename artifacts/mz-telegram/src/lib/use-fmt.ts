import { useCallback } from 'react';
import { getGetSettingsQueryKey, useGetSettings } from '@workspace/api-client-react';
import { fmtDate } from '@/lib/mz';

export function useFmt() {
  const { data } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey(), staleTime: 60000 } });
  const tz = data?.timezone;
  return useCallback((iso: string | null | undefined) => fmtDate(iso, tz), [tz]);
}
