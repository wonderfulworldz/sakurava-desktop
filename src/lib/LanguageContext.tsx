import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultLanguageCode,
  getStoredLanguageCode,
  getSupportedLanguages,
  resolveAvailableLanguageCode,
  storeLanguageCode,
  translate,
  type LanguageCode,
  type SupportedLanguage,
} from "./language";
import { getOverridesForLanguage } from "./languageOverrides";

type LanguageContextValue = {
  languageCode: LanguageCode;
  setLanguageCode: (languageCode: LanguageCode) => void;
  t: (key: string, replacements?: Record<string, string>) => string;
  refreshOverrides: () => void;
  refreshLanguages: () => void;
  languages: SupportedLanguage[];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [languageCode, setLanguageCodeState] = useState<LanguageCode>(() =>
    getStoredLanguageCode(),
  );
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    getOverridesForLanguage(getStoredLanguageCode()),
  );
  const [englishOverrides, setEnglishOverrides] = useState<Record<string, string>>(() =>
    getOverridesForLanguage(defaultLanguageCode),
  );
  const [languages, setLanguages] = useState<SupportedLanguage[]>(() =>
    getSupportedLanguages(),
  );

  const setLanguageCode = useCallback((nextLanguageCode: LanguageCode) => {
    const normalized = resolveAvailableLanguageCode(nextLanguageCode);
    if (!normalized) return;
    const persisted = storeLanguageCode(nextLanguageCode);
    if (!persisted.ok) return;
    setLanguageCodeState(normalized);
    setOverrides(getOverridesForLanguage(normalized));
    setEnglishOverrides(getOverridesForLanguage(defaultLanguageCode));
  }, []);

  const refreshOverrides = useCallback(() => {
    setOverrides(getOverridesForLanguage(languageCode));
    setEnglishOverrides(getOverridesForLanguage(defaultLanguageCode));
  }, [languageCode]);

  const refreshLanguages = useCallback(() => {
    const nextLanguages = getSupportedLanguages();
    setLanguages(nextLanguages);
    if (!nextLanguages.some((language) => language.code === languageCode)) {
      setLanguageCodeState(defaultLanguageCode);
      setOverrides(getOverridesForLanguage(defaultLanguageCode));
      setEnglishOverrides(getOverridesForLanguage(defaultLanguageCode));
    }
  }, [languageCode]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      languageCode,
      setLanguageCode,
      t: (key, replacements) =>
        translate(languageCode, key, replacements, overrides, englishOverrides),
      refreshOverrides,
      refreshLanguages,
      languages,
    }),
    [languageCode, setLanguageCode, overrides, englishOverrides, refreshOverrides, refreshLanguages, languages],
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

export function useTranslation() {
  const context = useContext(LanguageContext);
  return useCallback(
    (
      key: string,
      replacements: Record<string, string> = {},
    ) =>
      context?.t(key, replacements) ??
      translate(defaultLanguageCode, key, replacements),
    [context],
  );
}
