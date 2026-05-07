import Header from "#/components/header.tsx";
import { ThemeProvider, useTheme } from "#/hooks/use-theme.tsx";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppKitProvider } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solana, solanaTestnet, solanaDevnet } from "@reown/appkit/networks";

const solanaWeb3JsAdapter = new SolanaAdapter();

export const Route = createFileRoute("/_layout")({
  component: RouteComponent,
});

function AppShell() {
  const { theme } = useTheme();

  return (
    <AppKitProvider
      projectId="2a81f9e7c38958d0376014f3b4023629"
      adapters={[solanaWeb3JsAdapter]}
      networks={[solana, solanaTestnet, solanaDevnet]}
      metadata={{
        name: "Better Sol",
        description: "Better Sol",
        url: "https://better-sol.fun",
        icons: ["https://avatars.githubusercontent.com/u/179229932"],
      }}
      features={{
        analytics: true,
      }}
      themeMode={theme}
    >
      <Header />
      <Outlet />
    </AppKitProvider>
  );
}

function RouteComponent() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
