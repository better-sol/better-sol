import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { useAppKitTheme } from "@reown/appkit/react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  readonly theme: Theme;
  readonly toggleTheme: () => void;
}>({ theme: "light", toggleTheme: () => {} });

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);
  const { setThemeMode: setAppKitTheme } = useAppKitTheme();

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    setAppKitTheme(theme);
  }, [theme, mounted, setAppKitTheme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): { readonly theme: Theme; readonly toggleTheme: () => void } {
  return useContext(ThemeContext);
}
