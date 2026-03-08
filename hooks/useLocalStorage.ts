"use client";

import { useState, useCallback, useEffect } from "react";

/**
 * useState backed by localStorage with JSON serialization.
 * SSR-safe — returns initialValue on the server, hydrates from
 * localStorage on mount.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const item = localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(JSON.parse(item));
      }
    } catch {
      // If parsing fails, keep the initial value
    }
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // localStorage might be full or unavailable
        }
        return next;
      });
    },
    [key],
  );

  return [storedValue, setValue];
}
