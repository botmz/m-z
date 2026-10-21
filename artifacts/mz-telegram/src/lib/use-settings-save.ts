import { useQueryClient } from '@tanstack/react-query';
import { getGetSettingsQueryKey, useGetSettings, useSaveSettings, type Settings } from '@workspace/api-client-react';
import { toast } from '@/hooks/use-toast';
import { reportError } from '@/lib/mz';

/** Saves a partial patch merged over the full current settings. */
export function useSettingsSave() {
  const qc = useQueryClient();
  const q = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const m = useSaveSettings();
  const save = (patch: Partial<Settings>, onOk?: () => void) => {
    if (!q.data) return;
    m.mutate({ data: { ...q.data, ...patch } }, {
      onSuccess: (r) => {
        qc.setQueryData(getGetSettingsQueryKey(), r);
        toast({ title: 'تم حفظ الإعدادات' });
        onOk?.();
      },
      onError: (e) => reportError(e),
    });
  };
  return { query: q, save, saving: m.isPending };
}
