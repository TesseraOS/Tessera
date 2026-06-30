'use client';

import { useEffect, useState } from 'react';

/** Returns `value` after it has been stable for `delayMs` — used to debounce live search input. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
