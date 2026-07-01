import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';

export function useLiveQuery<T>(query: () => Promise<T>, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    const subscription = liveQuery(() => queryRef.current()).subscribe({
      next: setValue,
      error: (error) => console.error(error)
    });
    return () => subscription.unsubscribe();
  }, []);

  return value;
}
