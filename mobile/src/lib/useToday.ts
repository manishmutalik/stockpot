import { useCallback, useEffect, useRef, useState } from 'react';
import type { TodayView } from '../../../src/utils/quickApiTypes';
import type { Api } from './api';
import { describeApiError } from './api';

export interface TodayState {
  data: TodayView | null;
  /** True for the first load only; a pull to refresh is `refreshing`. */
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** The Today screen's figures, loaded when the screen opens and again on pull to refresh. Keeps the last good answer if a refresh fails. */
export function useToday(api: Api): TodayState {
  const [data, setData] = useState<TodayView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const view = await api.get<TodayView>('/api/mobile/today');
      if (!alive.current) return;
      setData(view);
      setError(null);
    } catch (err) {
      if (alive.current) setError(describeApiError(err));
    }
  }, [api]);

  useEffect(() => { load().finally(() => { if (alive.current) setLoading(false); }); }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (alive.current) setRefreshing(false);
  }, [load]);

  return { data, loading, refreshing, error, refresh };
}
