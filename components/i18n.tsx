"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState } from "react";
import { type Dict, LOCALE_COOKIE, type Locale, dictionaries } from "@/lib/i18n/dictionaries";

type I18n = { locale: Locale; t: Dict; setLocale: (l: Locale) => void };

const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n fuera de <I18nProvider>");
  return ctx;
}

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState(initialLocale);

  const setLocale = useCallback(
    (l: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      setLocaleState(l);
      // Para que lo que arma el servidor (metadata, etc.) también cambie de idioma.
      router.refresh();
    },
    [router],
  );

  return <I18nContext.Provider value={{ locale, t: dictionaries[locale], setLocale }}>{children}</I18nContext.Provider>;
}
