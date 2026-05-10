import Header from "#/components/header.tsx";
import { AppKitThemeSync } from "#/components/appkit-theme-sync.tsx";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { AppKitProvider } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solana, solanaTestnet, solanaDevnet } from "@reown/appkit/networks";
import SolarStarBoldDuotone from "~icons/solar/star-bold-duotone";
import SolarDocumentTextLineDuotone from "~icons/solar/document-text-line-duotone";
import SolarGlobalLineDuotone from "~icons/solar/global-line-duotone";
import SolarBoxLineDuotone from "~icons/solar/box-line-duotone";

const solanaWeb3JsAdapter = new SolanaAdapter();

export const Route = createFileRoute("/_layout")({
  component: RouteComponent,
  loader: async () => {
    try {
      const res = await fetch(
        "https://npmx.dev/api/registry/install-size/better-sol",
      );
      const data = (await res.json()) as { version: string; selfSize: number };
      return {
        version: data.version,
        selfSizeKb: (data.selfSize / 1024).toFixed(0),
      };
    } catch {
      return { version: "", selfSizeKb: "" };
    }
  },
});

function RouteComponent() {
  const meta = Route.useLoaderData();

  return (
    <AppKitProvider
      projectId="2a81f9e7c38958d0376014f3b4023629"
      adapters={[solanaWeb3JsAdapter]}
      networks={[solana, solanaTestnet, solanaDevnet]}
      metadata={{
        name: "Better Sol",
        description: "Write Solana programs in TypeScript.",
        url: "https://better-sol.fun",
        icons: ["https://better-sol.fun/icon.svg"],
      }}
      features={{
        analytics: true,
        swaps: false,
        onramp: false,
        pay: false,
        reownAuthentication: false,
      }}
      themeMode="light"
    >
      <AppKitThemeSync />
      <Header />
      <Outlet />

      <div className="border-y h-14">
        <div className="inner border-x" />
      </div>

      <footer className="inner border-x py-16 md:py-24 px-6 md:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-12 gap-x-8 gap-y-10 lg:gap-y-16">
          <div className="col-span-2 lg:col-span-5 flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <svg width="32" height="32" viewBox="0 0 121 121" fill="none">
                  <path
                    d="M69.03 120.548L48.16 100.573C47.706 100.139 47.345 99.613 47.098 99.029C46.85 98.445 46.723 97.816 46.724 97.179V22.319C46.724 21.867 46.852 21.425 47.094 21.047C47.335 20.669 47.679 20.372 48.082 20.192C48.486 20.012 48.932 19.957 49.366 20.033C49.8 20.11 50.202 20.315 50.524 20.623L71.394 20.78C71.846 21.214 72.207 21.737 72.454 22.319C72.701 22.901 72.829 23.529 72.83 24.164L72.83 118.852C72.83 119.304 72.701 119.746 72.46 120.124C72.219 120.502 71.875 120.799 71.471 120.98C71.068 121.159 70.622 121.215 70.188 121.138C69.754 121.061 69.351 120.856 69.03 120.548Z"
                    fill="#D909AD"
                  />
                  <path
                    d="M97.008 26.107H2.314C1.862 26.106 1.421 25.976 1.044 25.734C0.667 25.493 0.371 25.149 0.191 24.746C0.012 24.342 -0.043 23.896 0.034 23.463C0.111 23.03 0.316 22.628 0.624 22.306L20.609 1.436C21.042 0.984 21.566 0.623 22.148 0.376C22.73 0.129 23.358 0.001 23.992 0H118.681C119.133 0 119.575 0.129 119.953 0.37C120.33 0.611 120.627 0.955 120.808 1.359C120.988 1.762 121.043 2.209 120.966 2.642C120.89 3.076 120.685 3.479 120.377 3.801L100.401 24.671C99.967 25.124 99.442 25.486 98.858 25.733C98.274 25.979 97.644 26.107 97.008 26.107Z"
                    fill="#D909AD"
                  />
                </svg>
                <span className="font-serif text-xl font-bold">Better Sol</span>
              </div>
              <p className="text-muted text-sm leading-relaxed max-w-xs">
                Write Solana programs in TypeScript. No Rust needed.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>&copy; {new Date().getFullYear()}</span>
              <span className="size-1 rounded-full bg-muted" />
              <span>Alpha</span>
              <span className="size-1 rounded-full bg-muted" />
              <a
                href="https://github.com/powxenv/better-sol"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>

          <nav className="col-span-1 lg:col-span-2 flex flex-col gap-4">
            <span className="font-serif text-sm font-bold">Docs</span>
            <Link
              to="/docs/$"
              params={{ _splat: "your-first-program" }}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Your First Program
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: "your-first-client" }}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Your First Client
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: "project-structure" }}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Project Structure
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: "comparisons" }}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Comparisons
            </Link>
          </nav>

          <nav className="col-span-1 lg:col-span-2 flex flex-col gap-4">
            <span className="font-serif text-sm font-bold">Resources</span>
            <a
              href="https://github.com/powxenv/better-sol"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <Link
              to="/blog/$slug"
              params={{ slug: "alpha-launch" }}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Blog
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: "recipes/counter" }}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Examples
            </Link>
          </nav>

          <div className="col-span-2 lg:col-span-3 flex flex-col gap-6 lg:border-l lg:pl-6">
            <span className="font-serif text-sm font-bold">Status</span>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <SolarDocumentTextLineDuotone className="size-4 text-muted" />
                <span className="text-sm text-muted">
                  v{meta?.version ?? "..."}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <SolarBoxLineDuotone className="size-4 text-muted" />
                <span className="text-sm text-muted">
                  {meta?.selfSizeKb ?? "..."} KB
                </span>
              </div>
              <div className="flex items-center gap-2">
                <SolarGlobalLineDuotone className="size-4 text-muted" />
                <span className="text-sm text-muted">Browser + Node.js</span>
              </div>
            </div>
            <a
              href="https://github.com/powxenv/better-sol"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
            >
              <SolarStarBoldDuotone className="size-4" />
              Star on GitHub
            </a>
          </div>
        </div>
      </footer>
    </AppKitProvider>
  );
}
