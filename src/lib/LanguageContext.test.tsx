import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addCustomLanguage, removeCustomLanguage } from "./customLanguages";
import { LanguageProvider, useLanguage } from "./LanguageContext";
import { languageStorageKey } from "./language";
import { setOverrideForLanguage } from "./languageOverrides";
import { translationStorageKeys } from "./translationStorage";

function LanguageProbe() {
  const { languageCode, languages, setLanguageCode, refreshLanguages, t } = useLanguage();
  return (
    <>
      <div data-testid="language">{languageCode}</div>
      <div data-testid="languages">{languages.map((language) => language.code).join(",")}</div>
      <div data-testid="home">{t("nav.home")}</div>
      <button onClick={() => setLanguageCode("id")}>select id</button>
      <button onClick={() => setLanguageCode("en")}>select en</button>
      <button onClick={refreshLanguages}>refresh languages</button>
    </>
  );
}

describe("LanguageProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("selects a custom language only after persistence and applies English override fallback", () => {
    addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" });
    setOverrideForLanguage("en", "nav.home", "Dashboard");
    render(<LanguageProvider><LanguageProbe /></LanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: "select id" }));
    expect(screen.getByTestId("language")).toHaveTextContent("id");
    expect(screen.getByTestId("home")).toHaveTextContent("Dashboard");
    expect(window.localStorage.getItem(languageStorageKey)).toBe("id");
  });

  it("does not change effective selection when transaction persistence fails", () => {
    addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" });
    const realStorage = window.localStorage;
    const failingStorage: Storage = {
      get length() { return realStorage.length; },
      clear: () => realStorage.clear(),
      getItem: (key) => realStorage.getItem(key),
      key: (index) => realStorage.key(index),
      removeItem: (key) => realStorage.removeItem(key),
      setItem: (key, value) => {
        if (key === translationStorageKeys.transactionJournal) throw new Error("journal unavailable");
        realStorage.setItem(key, value);
      },
    };
    vi.spyOn(window, "localStorage", "get").mockReturnValue(failingStorage);
    render(<LanguageProvider><LanguageProbe /></LanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: "select id" }));
    expect(screen.getByTestId("language")).toHaveTextContent("en");
    expect(window.localStorage.getItem(languageStorageKey)).toBeNull();
  });

  it("falls back in memory after removal without rewriting the selected raw code", () => {
    addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" });
    window.localStorage.setItem(languageStorageKey, "ID");
    render(<LanguageProvider><LanguageProbe /></LanguageProvider>);
    expect(screen.getByTestId("language")).toHaveTextContent("id");
    expect(removeCustomLanguage("id").ok).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "refresh languages" }));
    expect(screen.getByTestId("language")).toHaveTextContent("en");
    expect(screen.getByTestId("languages")).toHaveTextContent("en");
    fireEvent.click(screen.getByRole("button", { name: "select en" }));
    expect(window.localStorage.getItem(languageStorageKey)).toBe("ID");
  });
});
