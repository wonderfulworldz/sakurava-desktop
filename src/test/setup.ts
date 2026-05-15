import "@testing-library/jest-dom/vitest";

function createTestStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

let hasLocalStorage = false;

try {
  hasLocalStorage = typeof window.localStorage !== "undefined";
} catch {
  hasLocalStorage = false;
}

if (!hasLocalStorage) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createTestStorage(),
  });
}
