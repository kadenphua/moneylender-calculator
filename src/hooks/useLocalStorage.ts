import { useCallback, useEffect, useState } from "react";

export function useLocalStorage(
  key: string,
  defaultValue: string,
): [string, (value: string) => void] {
  const [value, setValueState] = useState<string>(() => {
    if (typeof window === "undefined") return defaultValue;
    const stored = window.localStorage.getItem(key);
    return stored ?? defaultValue;
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        setValueState(e.newValue ?? defaultValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, defaultValue]);

  const setValue = useCallback(
    (next: string) => {
      window.localStorage.setItem(key, next);
      setValueState(next);
    },
    [key],
  );

  return [value, setValue];
}
