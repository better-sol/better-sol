import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import appCss from "../styles.css?url";
import type { QueryClient } from "@tanstack/react-query";
import { FormDevtoolsPanel } from "@tanstack/react-form-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { Toast } from "@heroui/react";
import { RootProvider } from "fumadocs-ui/provider/tanstack";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Better Sol — Write Solana programs in TypeScript",
      },
      {
        name: "description",
        content:
          "Write Solana programs in TypeScript. One file defines your program and your typed client. No Rust needed.",
      },
      {
        property: "og:title",
        content: "Better Sol — Write Solana programs in TypeScript",
      },
      {
        property: "og:description",
        content:
          "Write Solana programs in TypeScript. One file defines your program and your typed client. No Rust needed.",
      },
      {
        property: "og:url",
        content: "https://better-sol.fun",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:image",
        content: "https://better-sol.fun/logo512.png",
      },
      {
        name: "twitter:card",
        content: "summary",
      },
      {
        name: "twitter:title",
        content: "Better Sol — Write Solana programs in TypeScript",
      },
      {
        name: "twitter:description",
        content:
          "Write Solana programs in TypeScript. One file defines your program and your typed client. No Rust needed.",
      },
      {
        name: "twitter:image",
        content: "https://better-sol.fun/logo512.png",
      },
      {
        name: "theme-color",
        content: "#19FB9B",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/icon.svg",
      },
      {
        rel: "icon",
        type: "image/x-icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        href: "/logo192.png",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
    ],
  }),
  shellComponent: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="antialiased bg-background">
        <RootProvider>{children}</RootProvider>
        <Toast.Provider />
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
            {
              name: "TanStack Form",
              render: <FormDevtoolsPanel />,
            },
            {
              name: "TanStack Query",
              render: <ReactQueryDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
