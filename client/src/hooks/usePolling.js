import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Generic polling hook.
 * Fetches data immediately, then re-fetches every `interval` ms.
 * Stops polling when the component unmounts.
 */
export function usePolling(fetchFn, interval = 30000, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchFn();
      setData(result.data ?? result);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch();
    intervalRef.current = setInterval(fetch, interval);
    return () => clearInterval(intervalRef.current);
  }, [fetch, interval]);

  return { data, loading, error, lastUpdated, refresh: fetch };
}

/**
 * One-shot async action hook — for mutations (acknowledge, exit, etc.)
 */
export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (actionFn, onSuccess) => {
    setLoading(true);
    setError(null);
    try {
      const result = await actionFn();
      if (onSuccess) onSuccess(result);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, execute, clearError: () => setError(null) };
}
