const sessionFilterState = new Map<string, unknown>();

function cloneSessionValue<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    return [...value] as TValue;
  }

  if (value && typeof value === "object") {
    return { ...(value as Record<string, unknown>) } as TValue;
  }

  return value;
}

export function readSessionFilterState<TValue>(
  key: string,
  fallback: TValue,
): TValue {
  if (!sessionFilterState.has(key)) {
    return cloneSessionValue(fallback);
  }

  return cloneSessionValue(sessionFilterState.get(key) as TValue);
}

export function writeSessionFilterState<TValue>(key: string, value: TValue) {
  sessionFilterState.set(key, cloneSessionValue(value));
}

export function clearSessionFilterState(key: string) {
  sessionFilterState.delete(key);
}

export function clearAllSessionFilterStateForTests() {
  sessionFilterState.clear();
}
