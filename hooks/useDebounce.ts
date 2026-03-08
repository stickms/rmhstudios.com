"use client";

import { useState, useEffect } from "react";

/**
 * Returns a debounced version of `value` that only updates
 * after `delay` milliseconds of inactivity.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
