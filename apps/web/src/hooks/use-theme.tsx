import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { ScriptOnce } from "@tanstack/react-router";
import { useAppKitTheme } from "@reown/appkit/react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
}>({ theme: "light", setTheme: () => {} });

const STORAGE_KEY = "theme";

function getThemeScript(storageKey: string, fallback: Theme): string {
  const key = JSON.stringify(storageKey);
  const fb = JSON.stringify(fallback);
  return `(function(){try{var t=localStorage.getItem(${key});if(t!=='light'&&t!=='dark'){t=${fb}}var e=document.documentElement;e.setAttribute('data-theme',t);e.style.colorScheme=t}catch(e){}})()`;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = STORAGE_KEY,
}: {
  readonly children: ReactNode;
  readonly defaultTheme?: Theme;
  readonly storageKey?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [mounted, setMounted] = useState(false);
  const { setThemeMode: setAppKitTheme } = useAppKitTheme();

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
    }
    setMounted(true);
  }, [storageKey]);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    localStorage.setItem(storageKey, theme);
    setAppKitTheme(theme);
  }, [theme, mounted, storageKey, setAppKitTheme]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(storageKey, next);
    setThemeState(next);
  }, [storageKey]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <ScriptOnce>{getThemeScript(storageKey, defaultTheme)}</ScriptOnce>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): { readonly theme: Theme; readonly setTheme: (theme: Theme) => void } {
  return useContext(ThemeContext);
}
