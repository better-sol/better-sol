import { Button, buttonVariants, Surface, Tabs } from "@heroui/react";
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

import { HighlightCode } from "#/components/highlight-code";
import { useState } from "react";
import SolarCheckReadLineDuotone from "~icons/solar/check-read-line-duotone";

import SolarStarBoldDuotone from "~icons/solar/star-bold-duotone";

const superskillInstall = "npx skills add powxenv/better-sol@better-sol --yes";

function InstallCopyButton() {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(superskillInstall).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
    >
      {copied ? (
        <>
          <SolarCheckReadLineDuotone className="size-3.5 text-success" />
          Copied
        </>
      ) : (
        "Copy"
      )}
    </button>
  );
}

export const Route = createFileRoute("/_layout/")({
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

function ExamplePanel({
  title,
  description,
  code,
}: {
  readonly title: string;
  readonly description: string;
  readonly code: string;
}) {
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
  {
    icon: SolarCodeLineDuotone,
    title: "Write once, get everything",
    description:
      "One TypeScript file becomes your on-chain program, your typed client, and your database schema. No sync, no drift.",
    rotate: "-1.5",
  },
  {
    icon: SolarBoltLineDuotone,
    title: "One command to deploy",
    description:
      "Run deploy. Your program is on-chain. No toolchain to install, no build config to maintain.",
    rotate: "1",
  },
  {
    icon: SolarShieldCheckLineDuotone,
    title: "Types that write themselves",
    description:
      "Every account field, instruction argument, PDA seed, error, and event is inferred from your definition.",
    rotate: "0.5",
  },
  {
    icon: SolarBoxLineDuotone,
    title: "41 KB to the browser",
    description:
      "Zero compiler code in your bundle. Tokens, wallets, account decoding, and PDA derivation all included.",
    rotate: "-0.8",
  },
] as const;

function Home() {
  return (
    <>
      <div className="relative min-h-lvh flex items-end">
        <div className="inner relative flex h-full flex-col gap-20 border-x">
          <div className="grid grid-cols-1 md:grid-cols-2 items-end gap-8 md:gap-12 px-6 md:px-8 pt-30 md:pt-40">
            <div className="flex flex-col items-start gap-4">
              <Link
                to="/blog/$slug"
                params={{ slug: "dx-decisions" }}
                className="inline-flex h-10 items-center gap-2 rounded-xl border-[0.5px] bg-surface pl-2 pr-4 text-sm font-medium transition-all hover:bg-surface-secondary"
              >
                <SolarConfettiLineDuotone /> Why we built this{" "}
                <SolarArrowRightLineDuotone />
              </Link>
              <h1 className="text-3xl md:text-5xl">
                Write Solana programs in TypeScript.
              </h1>
            </div>
            <div className="flex flex-col gap-4">
              <p className="text-lg md:text-xl">
                Define your program, deploy it, and get a fully typed client —
                all from one TypeScript file. No Rust toolchain needed.
              </p>
              <Link
                to="/docs/$"
                params={{ _splat: "your-first-program" }}
                className={buttonVariants()}
              >
                Get Started <SolarArrowRightLineDuotone />
              </Link>
            </div>
          </div>

          <div className="relative h-full flex flex-col gap-8 px-6 md:px-8 pt-8">
            <video
              src="/hero.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="absolute! left-0 top-0 size-full object-cover"
            />

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

      <div className="inner border-x py-16 md:py-24 px-6 md:px-8">
        <div className="mb-10 md:mb-12 flex flex-col gap-4 items-start">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarCodeLineDuotone className="size-5" />
            Architecture
          </div>
          <h2 className="text-3xl md:text-5xl">
            One definition. Three outputs.
          </h2>
          <p className="text-lg">
            Write TypeScript once. Get an on-chain program, a typed client, and
            a database schema.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="p-2 border rounded-xl"
              style={{ transform: `rotate(${feature.rotate}deg)` }}
            >
              <Surface className="p-6 flex flex-col gap-2 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
                <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px]">
                  <feature.icon className="size-5 text-accent" />
                </div>
                <h3 className="font-serif text-lg font-bold">
                  {feature.title}
                </h3>
                <p className="text-muted text-sm leading-relaxed">
                  {feature.description}
                </p>
              </Surface>
            </div>
          ))}
        </div>
      </div>

      <div className="border-y h-14">
        <div className="inner border-x" />
      </div>

      <div className="inner border-x py-16 md:py-24 px-6 md:px-8">
        <div className="mb-10 md:mb-12 flex flex-col gap-4 items-start">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarBoxLineDuotone className="size-5" />
            SDK Capabilities
          </div>
          <h2 className="text-3xl md:text-5xl">
            Everything you need in one package.
          </h2>
          <p className="text-lg">
            Tokens, wallets, PDAs, events, external programs, and more. All
            typed, all automatic.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-center gap-4">
          <div className="p-2 border rounded-xl">
            <Surface className="p-6 flex flex-col gap-3 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
              <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                <SolarDollarLineDuotone className="size-5" />
              </div>
              <h3 className="font-serif text-lg font-bold">
                SPL Token & Token-2022
              </h3>
              <p className="text-muted text-sm leading-relaxed">
                Create mints, mint, transfer, and check balances. Same API for
                both token programs. ATAs created automatically.
              </p>
            </Surface>
          </div>
          <div className="p-2 border rounded-xl">
            <Surface className="p-6 flex flex-col gap-3 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
              <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                <SolarWalletMoneyLineDuotone className="size-5" />
              </div>
              <h3 className="font-serif text-lg font-bold">Wallet adapters</h3>
              <p className="text-muted text-sm leading-relaxed">
                Connect browser wallets with one call. Built-in adapters for
                Solana wallet adapter, Reown, Privy, and Dynamic.
              </p>
            </Surface>
          </div>
          <div className="p-2 border rounded-xl">
            <Surface className="p-6 flex flex-col gap-3 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
              <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                <SolarPlanetLineDuotone className="size-5" />
              </div>
              <h3 className="font-serif text-lg font-bold">
                External programs
              </h3>
              <p className="text-muted text-sm leading-relaxed">
                Import any on-chain program with full autocomplete. Generate
                from an address or load an IDL at runtime.
              </p>
            </Surface>
          </div>
          <div className="sm:col-span-2 lg:col-span-2 p-2 border rounded-xl">
            <Surface className="p-6 flex flex-col sm:flex-row gap-6 sm:gap-8 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                  <SolarCodeLineDuotone className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-bold">
                  PDA derivation & account fetching
                </h3>
                <p className="text-muted text-sm leading-relaxed">
                  Derive PDAs from your seed definitions. Fetch typed account
                  data in one call. No manual encoding or decoding.
                </p>
              </div>
              <div className="sm:w-[0.5px] sm:h-full h-[0.5px] w-full bg-border"></div>
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                  <SolarCheckCircleLineDuotone className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-bold">
                  Error & event parsing
                </h3>
                <p className="text-muted text-sm leading-relaxed">
                  Parse named errors and structured events from transaction
                  logs. Discriminators cached automatically.
                </p>
              </div>
            </Surface>
          </div>
          <div className="p-2 border rounded-xl">
            <Surface className="p-6 flex flex-col gap-3 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
              <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px] text-accent">
                <SolarDatabaseLineDuotone className="size-5" />
              </div>
              <h3 className="font-serif text-lg font-bold">Database schemas</h3>
              <p className="text-muted text-sm leading-relaxed">
                Generate ORM-ready schemas from your account definitions for indexing, analytics, and app backends.
                Supports Postgres, MySQL, and SQLite.
              </p>
            </Surface>
          </div>
        </div>
      </div>

      <div className="border-y h-14">
        <div className="inner border-x" />
      </div>

      <div className="inner border-x py-16 md:py-24 px-6 md:px-8">
        <div className="mb-10 md:mb-12 flex flex-col gap-4 items-start">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarStarBoldDuotone className="size-5" />
            Superskill
          </div>
          <h2 className="text-3xl md:text-5xl">
            One skill for your entire agent.
          </h2>
          <p className="text-lg max-w-2xl">
            A single Agent Skill with 52 references covering programs, security,
            DeFi, NFTs, oracles, cross-chain, frontend, tokenomics, and web3
            fundamentals. Install it once and your agent can build anything on
            Solana.
          </p>
        </div>

        <div className="p-2 border rounded-xl max-w-2xl">
          <Surface className="rounded-lg border-[0.5px]">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-xs text-muted font-mono">
                Install the skill
              </span>
              <InstallCopyButton />
            </div>
            <div className="p-4 font-mono text-sm leading-loose">
              <span className="text-muted select-none">$ </span>
              <span>npx skills add powxenv/better-sol@better-sol --yes</span>
            </div>
          </Surface>
        </div>

        <div className="mt-6 md:mt-8 flex flex-col sm:flex-row justify-start items-center gap-2">
          <Link to="/docs/$" params={{ _splat: "agent-skill" }}>
            <Button>
              See what's included <SolarArrowRightLineDuotone />
            </Button>
          </Link>
        </div>
      </div>

      <div className="border-y h-14">
        <div className="inner border-x" />
      </div>

      <div className="inner border-x py-20 md:py-24 px-6 md:px-8">
        <div className="mb-10 md:mb-12 flex flex-col items-center gap-4 md:gap-6 text-center max-w-xl mx-auto">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarBoltLineDuotone className="size-5" />
            Get Started
          </div>
          <h2 className="text-3xl md:text-5xl">Ship in under five minutes.</h2>
          <p className="text-lg md:text-xl">
            Initialize a project, create a program, and deploy on-chain. Your
            typed client is ready immediately.
          </p>
        </div>
        <div className="p-2 border rounded-xl">
          <Surface className="rounded-lg border-[0.5px]">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <span className="size-3 rounded-full bg-danger/60" />
              <span className="size-3 rounded-full bg-warning/60" />
              <span className="size-3 rounded-full bg-success/60" />
              <span className="ml-3 text-xs text-muted font-mono">
                ~/my-project
              </span>
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
              <div className="text-muted pl-4">
                ✓ Generated programs/counter.ts
              </div>
              <div className="text-muted pl-4 mb-2">
                ✓ Generated .better-sol/counter.json
              </div>

              <div className="flex gap-3">
                <span className="text-muted select-none">$</span>
                <span>npx @better-sol/cli@alpha deploy</span>
              </div>
              <div className="text-muted pl-4">Parsing counter.ts...</div>
              <div className="text-muted pl-4">Compiling...</div>
              <div className="text-muted pl-4">Deploying to devnet...</div>
              <div className="text-success pl-4 mb-2">
                ✓ Deployed counter at CoUnTeR1111...1111
              </div>
            </div>
          </Surface>
        </div>

        <div className="mt-6 md:mt-8 flex flex-col sm:flex-row justify-center items-center gap-2">
          <Link to="/docs/$" params={{ _splat: "your-first-program" }}>
            <Button>
              Read the Guide <SolarArrowRightLineDuotone />
            </Button>
          </Link>
          <a
            href="https://github.com/powxenv/better-sol"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline">View on GitHub</Button>
          </a>
        </div>
      </div>
    </>
  );
}
