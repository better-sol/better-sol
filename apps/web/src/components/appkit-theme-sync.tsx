import { useAppKitTheme } from "@reown/appkit/react";
import { useEffect } from "react";
import { useTheme } from "fumadocs-ui/provider/base";

export function AppKitThemeSync() {
  const { resolvedTheme } = useTheme();
  const { setThemeMode } = useAppKitTheme();

  useEffect(() => {
    if (resolvedTheme) setThemeMode(resolvedTheme);
  }, [resolvedTheme, setThemeMode]);

  return null;
}
