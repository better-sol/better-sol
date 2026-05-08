import { Button, Surface, Tabs } from "@heroui/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import SolarArrowRightLineDuotone from "~icons/solar/arrow-right-line-duotone";
import SolarConfettiLineDuotone from "~icons/solar/confetti-line-duotone";
import SolarCodeLineDuotone from "~icons/solar/code-line-duotone";
import SolarShieldCheckLineDuotone from "~icons/solar/shield-check-line-duotone";
import SolarBoxLineDuotone from "~icons/solar/box-line-duotone";
import SolarBoltLineDuotone from "~icons/solar/bolt-line-duotone";
import SolarWalletMoneyLineDuotone from "~icons/solar/wallet-money-line-duotone";
import SolarDollarLineDuotone from "~icons/solar/dollar-line-duotone";
import SolarPlanetLineDuotone from "~icons/solar/planet-line-duotone";
import SolarDatabaseLineDuotone from "~icons/solar/database-line-duotone";
import SolarCheckCircleLineDuotone from "~icons/solar/check-circle-line-duotone";
import SolarStarBoldDuotone from "~icons/solar/star-bold-duotone";
import SolarDocumentTextLineDuotone from "~icons/solar/document-text-line-duotone";
import SolarGlobalLineDuotone from "~icons/solar/global-line-duotone";
import { HighlightCode } from "#/components/highlight-code";
import UnicornScene from "unicornstudio-react";

export const Route = createFileRoute("/_layout/")({
  loader: async () => {
    try {
      const res = await fetch("https://npmx.dev/api/registry/install-size/better-sol");
      const data = await res.json() as { version: string; selfSize: number };
      return { version: data.version, selfSizeKb: (data.selfSize / 1024).toFixed(0) };
    } catch {
      return { version: "", selfSizeKb: "" };
    }
  },
  component: Home,
});

const programExample = `import { bs } from "better-sol/program";

const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
}).derive((seed) => ["counter", seed.authority]);

export const counter = bs.program(
  {
    name: "counter",
    address: "CoUnTeR11111111111111111111111111111111111",
    accounts: { Counter },
    errors: {
      Unauthorized: "Only the authority can update this counter",
    },
  },
  ix => ({
    initialize: ix({
      accounts: {
        counter: bs.init(Counter),
        authority: bs.signer(),
      },
      run: ({ counter, authority }) => {
        counter.count = 0n;
        counter.authority = authority;
      },
    }),

    increment: ix({
      accounts: {
        counter: bs.mut(Counter),
        authority: bs.signer(),
      },
      args: { amount: bs.u64() },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        counter.count += amount;
      },
    }),
  }),
);`;

const sdkExample = `import { betterSol, keypairFile } from "better-sol";
import { counter } from "./programs/counter";

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
});

const counterAddress = await sol.counter.accounts.Counter.derive({
  authority: sol.payer,
});

await sol.counter.initialize({
  counter: counterAddress,
});

await sol.counter.increment({
  counter: counterAddress,
  amount: 1n,
});

const account = await sol.counter.accounts.Counter.fetch(counterAddress);
console.log(account?.count);`;

function ExamplePanel({ title, description, code }: { readonly title: string; readonly description: string; readonly code: string }) {
  return (
    <Surface className="h-[60lvh] bg-surface/90 backdrop-blur-3xl overflow-hidden w-full rounded-t-2xl border-[0.5px] px-1 pt-1">
      <div className="flex flex-col gap-2 p-4">
        <h2 className="text-2xl">{title}</h2>
        <p className="text-lg">{description}</p>
      </div>
      <div className="overflow-y-auto rounded-t-xl border-[0.5px]">
        <HighlightCode code={code} />
      </div>
    </Surface>
  );
}

const features = [
  { icon: SolarCodeLineDuotone, title: "Write once, get everything", description: "One TypeScript file becomes your on-chain program, your typed client, and your database schema. No sync, no drift.", rotate: "-1.5" },
  { icon: SolarBoltLineDuotone, title: "One command to deploy", description: "Run deploy. Your program is on-chain. No toolchain to install, no build config to maintain.", rotate: "1" },
  { icon: SolarShieldCheckLineDuotone, title: "Types that write themselves", description: "Every account field, instruction argument, PDA seed, error, and event is inferred from your definition.", rotate: "0.5" },
  { icon: SolarBoxLineDuotone, title: "41 KB to the browser", description: "Zero compiler code in your bundle. Tokens, wallets, account decoding, and PDA derivation all included.", rotate: "-0.8" },
] as const;

function Home() {
  const meta = Route.useLoaderData();

  return (
    <>
      <div className="relative min-h-lvh flex items-end">
        <div className="inner relative flex h-full flex-col gap-20 border-x">
          <div className="grid grid-cols-2 items-end gap-12 px-8 pt-40">
            <div className="flex flex-col items-start gap-4">
              <Link to="/blog/$slug" params={{ slug: "dx-decisions" }} className="inline-flex h-10 items-center gap-2 rounded-xl border-[0.5px] bg-surface pl-2 pr-4 text-sm font-medium transition-all hover:bg-surface-secondary">
                <SolarConfettiLineDuotone /> TypeScript-first Solana DX, Read More <SolarArrowRightLineDuotone />
              </Link>
              <h1 className="text-5xl">
                The fastest way to go from idea to Solana program.
              </h1>
            </div>
            <div className="flex flex-col gap-4">
              <p className="text-xl">
                Better Sol gives you one TypeScript definition for program logic, account types, client calls, and SDK autocomplete. Less boilerplate. Fewer mismatches. Faster shipping.
              </p>
              <Button>
                Get Started <SolarArrowRightLineDuotone />
              </Button>
            </div>
          </div>

          <div className="relative h-full flex flex-col gap-8 px-8 pt-8">
            {/* <video src="/hero.mp4" autoPlay loop muted playsInline className="absolute! left-0 top-0 size-full object-cover" /> */}
            <UnicornScene projectId="JQufMz8tqz7Bnn9sk23U" className="absolute! left-0 top-0 size-full object-cover" />

            <Tabs className="relative z-999999999">
              <Tabs.ListContainer className="mx-auto max-w-max">
                <Tabs.List aria-label="Better Sol examples">
                  <Tabs.Tab className="whitespace-nowrap" id="overview">
                    Define
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab className="whitespace-nowrap" id="sdk">
                    Use
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel className="p-0" id="overview">
                <ExamplePanel
                  title="Your program starts as TypeScript"
                  description="Model state, instructions, validation, and PDAs in one compact definition."
                  code={programExample}
                />
              </Tabs.Panel>
              <Tabs.Panel className="p-0" id="sdk">
                <ExamplePanel
                  title="Your SDK is already typed"
                  description="The same definition powers typed instructions, account fetching, PDA derivation, and wallet-ready transactions."
                  code={sdkExample}
                />
              </Tabs.Panel>
            </Tabs>
          </div>
        </div>
      </div>

      <div className="border-y h-14">
        <div className="inner border-x" />
      </div>

      <div className="inner border-x py-24 px-8">
        <div className="mb-12 flex flex-col gap-4 items-start">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarCodeLineDuotone className="size-5" />
            Architecture
          </div>
          <h2 className="text-5xl">One definition. Three outputs.</h2>
          <p className="text-lg">Write TypeScript once. Get an on-chain program, a typed client, and a database schema.</p>
        </div>
        <div className="grid grid-cols-4 gap-4 items-start">
          {features.map((feature) => (
            <div key={feature.title} className="p-2 border rounded-xl" style={{ transform: `rotate(${feature.rotate}deg)` }}>
              <Surface className="p-6 flex flex-col gap-2 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
                <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px]">
                  <feature.icon className="size-5 text-accent" />
                </div>
                <h3 className="font-serif text-lg font-bold">{feature.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{feature.description}</p>
              </Surface>
            </div>
          ))}
        </div>
      </div>

      <div className="border-y h-14">
        <div className="inner border-x" />
      </div>

      <div className="inner border-x py-24 px-8">
        <div className="mb-12 flex flex-col gap-4 items-start">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarBoxLineDuotone className="size-5" />
            SDK Capabilities
          </div>
          <h2 className="text-5xl">Everything you need in one package.</h2>
          <p className="text-lg">Tokens, wallets, PDAs, events, external programs, and more. All typed, all automatic.</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-2 border rounded-xl">
            <Surface className="p-6 flex flex-col gap-3 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
              <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                <SolarDollarLineDuotone className="size-5" />
              </div>
              <h3 className="font-serif text-lg font-bold">SPL Token & Token-2022</h3>
              <p className="text-muted text-sm leading-relaxed">Create mints, mint, transfer, and check balances. Same API for both token programs. ATAs created automatically.</p>
            </Surface>
          </div>
          <div className="p-2 border rounded-xl">
            <Surface className="p-6 flex flex-col gap-3 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
              <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                <SolarWalletMoneyLineDuotone className="size-5" />
              </div>
              <h3 className="font-serif text-lg font-bold">Wallet adapters</h3>
              <p className="text-muted text-sm leading-relaxed">Connect browser wallets with one call. Built-in adapters for Solana wallet adapter, Reown, Privy, and Dynamic.</p>
            </Surface>
          </div>
          <div className="p-2 border rounded-xl">
            <Surface className="p-6 flex flex-col gap-3 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
              <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                <SolarPlanetLineDuotone className="size-5" />
              </div>
              <h3 className="font-serif text-lg font-bold">External programs</h3>
              <p className="text-muted text-sm leading-relaxed">Import any on-chain program with full autocomplete. Generate from an address or load an IDL at runtime.</p>
            </Surface>
          </div>
          <div className="col-span-2 p-2 border rounded-xl">
            <Surface className="p-6 flex gap-8 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                  <SolarCodeLineDuotone className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-bold">PDA derivation & account fetching</h3>
                <p className="text-muted text-sm leading-relaxed">Derive PDAs from your seed definitions. Fetch typed account data in one call. No manual encoding or decoding.</p>
              </div>
              <div className="flex flex-col gap-3 flex-1 border-l pl-8">
                <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                  <SolarCheckCircleLineDuotone className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-bold">Error & event parsing</h3>
                <p className="text-muted text-sm leading-relaxed">Parse named errors and structured events from transaction logs. Discriminators cached automatically.</p>
              </div>
            </Surface>
          </div>
          <div className="p-2 border rounded-xl">
            <Surface className="p-6 flex flex-col gap-3 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
              <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                <SolarDatabaseLineDuotone className="size-5" />
              </div>
              <h3 className="font-serif text-lg font-bold">Database schemas</h3>
              <p className="text-muted text-sm leading-relaxed">Generate Drizzle ORM schemas from your account definitions. Supports Postgres, MySQL, and SQLite.</p>
            </Surface>
          </div>
        </div>
      </div>

      <div className="border-y h-14">
        <div className="inner border-x" />
      </div>

      <div className="inner border-x py-24 px-8">
        <div className="mb-12 flex flex-col items-center gap-6 text-center max-w-xl mx-auto">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarBoltLineDuotone className="size-5" />
            Get Started
          </div>
          <h2 className="text-5xl">Ship in under five minutes.</h2>
          <p className="text-xl">Initialize a project, create a program, and deploy on-chain. Your typed client is ready immediately.</p>
        </div>
        <div className="p-2 border rounded-xl">
          <Surface className="rounded-lg border-[0.5px]">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <span className="size-3 rounded-full bg-danger/60" />
              <span className="size-3 rounded-full bg-warning/60" />
              <span className="size-3 rounded-full bg-success/60" />
              <span className="ml-3 text-xs text-muted font-mono">~/my-project</span>
            </div>
            <div className="p-6 font-mono text-sm leading-loose">
              <div className="flex gap-3">
                <span className="text-muted select-none">$</span>
                <span>npx @better-sol/cli@alpha init</span>
              </div>
              <div className="text-muted pl-4">✓ Created keypair.json</div>
              <div className="text-muted pl-4">✓ Created programs/</div>
              <div className="text-muted pl-4 mb-2">✓ Installed better-sol</div>

              <div className="flex gap-3">
                <span className="text-muted select-none">$</span>
                <span>npx @better-sol/cli@alpha create counter</span>
              </div>
              <div className="text-muted pl-4">✓ Generated programs/counter.ts</div>
              <div className="text-muted pl-4 mb-2">✓ Generated .better-sol/counter.json</div>

              <div className="flex gap-3">
                <span className="text-muted select-none">$</span>
                <span>npx @better-sol/cli@alpha deploy</span>
              </div>
              <div className="text-muted pl-4">Parsing counter.ts...</div>
              <div className="text-muted pl-4">Compiling...</div>
              <div className="text-muted pl-4">Deploying to devnet...</div>
              <div className="text-success pl-4 mb-2">✓ Deployed counter at CoUnTeR1111...1111</div>
            </div>
          </Surface>
        </div>

        <div className="mt-8 flex justify-center gap-2">
          <Link to="/docs/$" params={{ _splat: "your-first-program" }}>
            <Button>
              Read the Guide <SolarArrowRightLineDuotone />
            </Button>
          </Link>
          <a href="https://github.com/powxenv/better-sol" target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              View on GitHub
            </Button>
          </a>
        </div>
      </div>

      <div className="border-y h-14">
        <div className="inner border-x" />
      </div>

      <div className="inner border-x py-24 px-8">
        <div className="grid grid-cols-12 gap-x-8 gap-y-16">
          <div className="col-span-5 flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <svg width="32" height="32" viewBox="0 0 121 121" fill="none">
                  <path d="M69.03 120.548L48.16 100.573C47.706 100.139 47.345 99.613 47.098 99.029C46.85 98.445 46.723 97.816 46.724 97.179V22.319C46.724 21.867 46.852 21.425 47.094 21.047C47.335 20.669 47.679 20.372 48.082 20.192C48.486 20.012 48.932 19.957 49.366 20.033C49.8 20.11 50.202 20.315 50.524 20.623L71.394 20.78C71.846 21.214 72.207 21.737 72.454 22.319C72.701 22.901 72.829 23.529 72.83 24.164L72.83 118.852C72.83 119.304 72.701 119.746 72.46 120.124C72.219 120.502 71.875 120.799 71.471 120.98C71.068 121.159 70.622 121.215 70.188 121.138C69.754 121.061 69.351 120.856 69.03 120.548Z" fill="#D909AD" />
                  <path d="M97.008 26.107H2.314C1.862 26.106 1.421 25.976 1.044 25.734C0.667 25.493 0.371 25.149 0.191 24.746C0.012 24.342 -0.043 23.896 0.034 23.463C0.111 23.03 0.316 22.628 0.624 22.306L20.609 1.436C21.042 0.984 21.566 0.623 22.148 0.376C22.73 0.129 23.358 0.001 23.992 0H118.681C119.133 0 119.575 0.129 119.953 0.37C120.33 0.611 120.627 0.955 120.808 1.359C120.988 1.762 121.043 2.209 120.966 2.642C120.89 3.076 120.685 3.479 120.377 3.801L100.401 24.671C99.967 25.124 99.442 25.486 98.858 25.733C98.274 25.979 97.644 26.107 97.008 26.107Z" fill="#D909AD" />
                </svg>
                <span className="font-serif text-xl font-bold">Better Sol</span>
              </div>
              <p className="text-muted text-sm leading-relaxed max-w-xs">TypeScript-first Solana development. Write programs, not boilerplate.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>&copy; {new Date().getFullYear()}</span>
              <span className="size-1 rounded-full bg-muted" />
              <span>Alpha</span>
              <span className="size-1 rounded-full bg-muted" />
              <a href="https://github.com/powxenv/better-sol" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
            </div>
          </div>

          <div className="col-span-2 flex flex-col gap-4">
            <span className="font-serif text-sm font-bold">Docs</span>
            <Link to="/docs/$" params={{ _splat: "your-first-program" }} className="text-sm text-muted hover:text-foreground transition-colors">Your First Program</Link>
            <Link to="/docs/$" params={{ _splat: "your-first-client" }} className="text-sm text-muted hover:text-foreground transition-colors">Your First Client</Link>
            <Link to="/docs/$" params={{ _splat: "project-structure" }} className="text-sm text-muted hover:text-foreground transition-colors">Project Structure</Link>
            <Link to="/docs/$" params={{ _splat: "comparisons" }} className="text-sm text-muted hover:text-foreground transition-colors">Comparisons</Link>
          </div>

          <div className="col-span-2 flex flex-col gap-4">
            <span className="font-serif text-sm font-bold">Resources</span>
            <a href="https://github.com/powxenv/better-sol" target="_blank" rel="noopener noreferrer" className="text-sm text-muted hover:text-foreground transition-colors">GitHub</a>
            <Link to="/blog/$slug" params={{ slug: "alpha-launch" }} className="text-sm text-muted hover:text-foreground transition-colors">Blog</Link>
            <Link to="/docs/$" params={{ _splat: "recipes/counter" }} className="text-sm text-muted hover:text-foreground transition-colors">Examples</Link>
          </div>

          <div className="col-span-3 flex flex-col gap-6 pl-6 border-l">
            <span className="font-serif text-sm font-bold">Status</span>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <SolarDocumentTextLineDuotone className="size-4 text-muted" />
                <span className="text-sm text-muted">v{meta?.version ?? "..."}</span>
              </div>
              <div className="flex items-center gap-2">
                <SolarBoxLineDuotone className="size-4 text-muted" />
                <span className="text-sm text-muted">{meta?.selfSizeKb ?? "..."} KB</span>
              </div>
              <div className="flex items-center gap-2">
                <SolarGlobalLineDuotone className="size-4 text-muted" />
                <span className="text-sm text-muted">Browser + Node.js</span>
              </div>
            </div>
            <a href="https://github.com/powxenv/better-sol" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors">
              <SolarStarBoldDuotone className="size-4" />
              Star on GitHub
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
