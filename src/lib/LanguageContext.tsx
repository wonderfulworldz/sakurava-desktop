import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getStoredLanguageCode,
  storeLanguageCode,
  translate,
  type LanguageCode,
} from "./language";

type LanguageContextValue = {
  languageCode: LanguageCode;
  setLanguageCode: (languageCode: LanguageCode) => void;
  t: (key: string, replacements?: Record<string, string>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [languageCode, setLanguageCodeState] = useState<LanguageCode>(() =>
    getStoredLanguageCode(),
  );

  const setLanguageCode = useCallback((nextLanguageCode: LanguageCode) => {
    setLanguageCodeState(nextLanguageCode);
    storeLanguageCode(nextLanguageCode);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      languageCode,
      setLanguageCode,
      t: (key, replacements) => translate(languageCode, key, replacements),
    }),
    [languageCode, setLanguageCode],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider.");
  }
  return context;
}
