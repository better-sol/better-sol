import { Button, Surface } from "@heroui/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import SolarCheckReadLineDuotone from "~icons/solar/check-read-line-duotone";
import SolarArrowRightLineDuotone from "~icons/solar/arrow-right-line-duotone";
import SolarCodeLineDuotone from "~icons/solar/code-line-duotone";
import SolarShieldCheckLineDuotone from "~icons/solar/shield-check-line-duotone";
import SolarBoltLineDuotone from "~icons/solar/bolt-line-duotone";
import SolarPlanetLineDuotone from "~icons/solar/planet-line-duotone";
import SolarBoxLineDuotone from "~icons/solar/box-line-duotone";
import SolarWalletMoneyLineDuotone from "~icons/solar/wallet-money-line-duotone";
import SolarCheckCircleLineDuotone from "~icons/solar/check-circle-line-duotone";
import SolarDocumentTextLineDuotone from "~icons/solar/document-text-line-duotone";
import SolarStarBoldDuotone from "~icons/solar/star-bold-duotone";
import SolarUsersGroupRoundedLineDuotone from "~icons/solar/users-group-rounded-line-duotone";
import SolarLockLineDuotone from "~icons/solar/lock-line-duotone";
import SolarPaletteLineDuotone from "~icons/solar/palette-line-duotone";
import SolarRocketLineDuotone from "~icons/solar/rocket-line-duotone";
import SolarBookLineDuotone from "~icons/solar/book-line-duotone";
import SolarChartLineDuotone from "~icons/solar/chart-line-duotone";

export const Route = createFileRoute("/_layout/superskill")({
  component: Superskill,
});

const repo = "https://github.com/powxenv/better-sol/blob/main/skills/better-sol";

const modes = [
  {
    icon: SolarCodeLineDuotone,
    label: "Build",
    title: "Programs, clients, tests, deploy",
    rotate: "-1.2",
    items: [
      "Better Sol SDK: accounts, instructions, PDAs, CPIs, typed clients",
      "Scaffold, write, compile, deploy in one flow",
      "LiteSVM test harness with typed helpers",
      "Anchor IDL import and migration guides",
      "Debug compile, deploy, and transaction failures",
      "dApp architecture: wallet, RPC, backend, state sync",
      "Advanced Solana: compute budget, ALTs, compression, Token-2022",
    ],
  },
  {
    icon: SolarBookLineDuotone,
    label: "Learn",
    title: "Solana, web3, and Better Sol",
    rotate: "0.8",
    items: [
      "Structured tracks: beginner, EVM, frontend, backend, DeFi",
      "Solana fundamentals: accounts, programs, PDAs, CPIs, rent",
      "Web3 fundamentals: consensus, execution environments, cryptography",
      "Cookbook recipes with progressive exercises",
    ],
  },
  {
    icon: SolarPlanetLineDuotone,
    label: "Domain",
    title: "Architecture for every domain",
    rotate: "-0.6",
    items: [
      "DeFi: AMMs, lending, vaults, staking, perps, yield, risk frameworks",
      "Tokens: SPL Token, Token-2022, launch, distribution, airdrops",
      "NFTs: Metaplex, minting, marketplaces, compressed NFTs",
      "DAOs: governance, voting, treasury, SPL Governance",
      "Oracles: Pyth, Switchboard, VRF, external data feeds",
      "Cross-chain: bridges, message passing, multi-chain design",
      "Stablecoins and RWA tokenization",
      "Data pipelines, mobile dApps, sybil resistance",
    ],
  },
  {
    icon: SolarLockLineDuotone,
    label: "Secure",
    title: "Audit with evidence",
    rotate: "1.1",
    items: [
      "Program safety checklist and attack catalog",
      "Cross-chain attack patterns and defense-in-depth",
      "Economic security, game theory, incentive design",
      "STRIDE threat modeling and operational checks",
      "OWASP-style severity calibration",
      "Exploit regression test design",
    ],
  },
  {
    icon: SolarPaletteLineDuotone,
    label: "Design",
    title: "Crypto-native frontend",
    rotate: "-0.9",
    items: [
      "Brand system: palette, typography, voice, preview workflow",
      "Transaction UX: signing states, previews, error copy",
      "Multi-chain UI: wallet connection, address formats, chain selection",
      "dApp state management: caching, optimistic updates, subscriptions",
      "Number formatting: tokens, SOL, fiat, percentages, TVL",
      "Accessibility: WCAG 2.2 contrast, focus, reduced motion",
      "Motion, page entrance animation, video frame craft",
    ],
  },
  {
    icon: SolarRocketLineDuotone,
    label: "Launch",
    title: "Strategy to production",
    rotate: "0.5",
    items: [
      "Ideation, validation, competitive landscape, positioning",
      "Tokenomics: utility types, supply mechanics, fee models",
      "Product review, roast, prioritization",
      "Pitch decks, grant applications, hackathon preparation",
      "Marketing, video production, go-to-market planning",
      "Community building, distribution channels, growth metrics",
    ],
  },
] as const;

const references = [
  { name: "Architecture playbook", file: "references/architecture-playbook.md" },
  { name: "Program patterns", file: "references/program-patterns.md" },
  { name: "SDK reference", file: "references/sdk-reference.md" },
  { name: "Client & testing", file: "references/client-testing-deploy.md" },
  { name: "Troubleshooting", file: "references/troubleshooting.md" },
  { name: "Interop & migration", file: "references/interop-and-migration.md" },
  { name: "Web3 dApp architecture", file: "references/web3-dapp-architecture.md" },
  { name: "Advanced Solana", file: "references/advanced-solana.md" },
  { name: "Solana knowledge base", file: "references/solana-knowledge-base.md" },
  { name: "Web3 fundamentals", file: "references/web3-fundamentals.md" },
  { name: "Learning tracks", file: "references/tracks.md" },
  { name: "Cookbook recipes", file: "references/cookbook-recipes.md" },
  { name: "DeFi patterns", file: "references/defi.md" },
  { name: "DeFi deep dive", file: "references/defi-deep-dive.md" },
  { name: "Token patterns", file: "references/tokens.md" },
  { name: "NFTs & Metaplex", file: "references/nfts-and-metaplex.md" },
  { name: "DAO governance", file: "references/dao-governance.md" },
  { name: "Oracles & external data", file: "references/oracles-and-external-data.md" },
  { name: "Cross-chain patterns", file: "references/cross-chain.md" },
  { name: "Stablecoins & RWAs", file: "references/stablecoins-and-rwas.md" },
  { name: "Data pipelines", file: "references/data-pipelines.md" },
  { name: "Mobile patterns", file: "references/mobile.md" },
  { name: "Sybil resistance", file: "references/humanity.md" },
  { name: "Security checklist", file: "references/security-checklist.md" },
  { name: "Attack catalog", file: "references/attack-catalog.md" },
  { name: "Cross-chain security", file: "references/cross-chain-security.md" },
  { name: "Economic security", file: "references/economic-security.md" },
  { name: "Threat model", file: "references/threat-model.md" },
  { name: "Risk scoring", file: "references/risk-scoring.md" },
  { name: "Security test plan", file: "references/test-plan.md" },
  { name: "Brand system", file: "references/brand.md" },
  { name: "Brand preview workflow", file: "references/brand-preview-workflow.md" },
  { name: "Transaction UX", file: "references/transaction-ux.md" },
  { name: "Multi-chain UI", file: "references/multi-chain-ui.md" },
  { name: "dApp state management", file: "references/dapp-state-management.md" },
  { name: "Number formatting", file: "references/number-formatting.md" },
  { name: "Accessibility", file: "references/accessibility-evaluation.md" },
  { name: "Motion & video craft", file: "references/motion-and-video.md" },
  { name: "Pitch & video craft", file: "references/pitch-and-video-craft.md" },
  { name: "Strategy & validation", file: "references/strategy.md" },
  { name: "Evaluation frameworks", file: "references/evaluation-frameworks.md" },
  { name: "Idea bank", file: "references/idea-bank.md" },
  { name: "Tokenomics", file: "references/tokenomics.md" },
  { name: "DeFi market research", file: "references/defillama-research.md" },
  { name: "Product review", file: "references/product-review.md" },
  { name: "Submission assets", file: "references/submission-assets.md" },
  { name: "Pitch deck design", file: "references/pitch-deck-design.md" },
  { name: "Grant application", file: "references/grant-application.md" },
  { name: "Marketing", file: "references/marketing.md" },
  { name: "Go-to-market", file: "references/go-to-market.md" },
] as const;

const coverageCards = [
  {
    icon: SolarCodeLineDuotone,
    title: "Better Sol SDK",
    rotate: "-1.5",
    description:
      "Program DSL, typed clients, LiteSVM tests, CLI deploy, IDL import, token CPI, wallet adapters.",
  },
  {
    icon: SolarShieldCheckLineDuotone,
    title: "Security",
    rotate: "1",
    description:
      "Attack catalog, threat modeling, economic security, severity calibration, test plans, defense-in-depth.",
  },
  {
    icon: SolarPlanetLineDuotone,
    title: "Web3 breadth",
    rotate: "0.5",
    description:
      "EVM comparison, consensus, execution environments, cross-chain bridges, stablecoins, RWA tokenization.",
  },
  {
    icon: SolarPaletteLineDuotone,
    title: "Frontend craft",
    rotate: "-0.8",
    description:
      "Brand system, transaction UX, dApp state, number formatting, multi-chain UI, accessibility, motion.",
  },
] as const;

function SectionDivider() {
  return (
    <div className="border-y h-14">
      <div className="inner border-x" />
    </div>
  );
}

const installCommand = "npx skills add powxenv/better-sol@better-sol --yes";

function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
    >
      {copied ? (
        <>
          <SolarCheckReadLineDuotone className="size-4 text-success" />
          Copied
        </>
      ) : (
        "Copy"
      )}
    </button>
  );
}

function Superskill() {
  return (
    <>
      <div className="inner min-h-[60lvh] flex flex-col justify-center py-30 md:py-40 px-6 md:px-8 border-x">
        <div className="flex flex-col gap-6 max-w-2xl">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl w-fit">
            <SolarStarBoldDuotone className="size-5" />
            Agent Skill
          </div>
          <h1 className="text-3xl md:text-5xl">
            One skill. Everything you need to build on Solana.
          </h1>
          <p className="text-lg md:text-xl text-muted">
            A single Agent Skill covering programs, clients, testing, security,
            DeFi, tokens, NFTs, DAOs, oracles, cross-chain, frontend design,
            tokenomics, product strategy, and web3 fundamentals. Drop it into any
            Agent Skills-compatible client and start building.
          </p>
          <div className="flex flex-col gap-3 mt-2">
            <div className="p-2 border rounded-xl w-fit">
              <Surface className="flex items-center gap-4 rounded-lg border-[0.5px] px-4 py-3 font-mono text-sm">
                <span className="text-muted select-none">$</span>
                <span>{installCommand}</span>
                <CopyButton text={installCommand} />
              </Surface>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href={`${repo}/SKILL.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button>
                  <SolarBoxLineDuotone className="size-5" />
                  View on GitHub
                </Button>
              </a>
              <Link to="/docs/$" params={{ _splat: "your-first-program" }}>
                <Button variant="outline">
                  Read the Docs <SolarArrowRightLineDuotone className="size-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <SectionDivider />

      <div className="inner border-x py-16 md:py-24 px-6 md:px-8">
        <div className="mb-10 md:mb-12 flex flex-col gap-4 items-start">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarBoltLineDuotone className="size-5" />
            Six modes
          </div>
          <h2 className="text-3xl md:text-5xl">
            Load what you need. Ignore the rest.
          </h2>
          <p className="text-lg text-muted max-w-2xl">
            The skill routes to the right reference based on the task. Each mode
            loads only its relevant files. No wasted context.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {modes.map((mode) => (
            <div
              key={mode.label}
              className="p-2 border rounded-xl"
              style={{ transform: `rotate(${mode.rotate}deg)` }}
            >
              <Surface className="p-6 flex flex-col gap-4 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg h-full">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px]">
                    <mode.icon className="size-5 text-accent" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-serif text-lg font-bold">
                      {mode.label}
                    </span>
                    <span className="text-xs text-muted">{mode.title}</span>
                  </div>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {mode.items.map((item) => (
                    <li
                      key={item}
                      className="text-sm text-muted leading-relaxed flex gap-2"
                    >
                      <span className="text-accent mt-1.5 shrink-0">
                        &bull;
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Surface>
            </div>
          ))}
        </div>
      </div>

      <SectionDivider />

      <div className="inner border-x py-16 md:py-24 px-6 md:px-8">
        <div className="mb-10 md:mb-12 flex flex-col gap-4 items-start">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarChartLineDuotone className="size-5" />
            Coverage
          </div>
          <h2 className="text-3xl md:text-5xl">
            From first line to mainnet.
          </h2>
          <p className="text-lg text-muted max-w-2xl">
            Every phase of building a blockchain application, covered in one
            self-contained skill.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {coverageCards.map((card) => (
            <div
              key={card.title}
              className="p-2 border rounded-xl"
              style={{ transform: `rotate(${card.rotate}deg)` }}
            >
              <Surface className="p-6 flex flex-col gap-2 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg">
                <div className="flex size-10 items-center justify-center rounded-xl border-[0.5px]">
                  <card.icon className="size-5 text-accent" />
                </div>
                <h3 className="font-serif text-lg font-bold">{card.title}</h3>
                <p className="text-muted text-sm leading-relaxed">
                  {card.description}
                </p>
              </Surface>
            </div>
          ))}
        </div>
      </div>

      <SectionDivider />

      <div className="inner border-x py-16 md:py-24 px-6 md:px-8">
        <div className="mb-10 md:mb-12 flex flex-col gap-4 items-start">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarDocumentTextLineDuotone className="size-5" />
            References
          </div>
          <h2 className="text-3xl md:text-5xl">50 reference files.</h2>
          <p className="text-lg text-muted max-w-2xl">
            Each file covers one topic. The agent loads only what the task
            requires. Every reference links to related files for deeper dives.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {references.map((ref) => (
            <a
              key={ref.name}
              href={`${repo}/${ref.file}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 border rounded-lg text-sm text-muted hover:text-foreground hover:border-foreground/20 transition-all"
            >
              {ref.name}
            </a>
          ))}
        </div>
      </div>

      <SectionDivider />

      <div className="inner border-x py-16 md:py-24 px-6 md:px-8">
        <div className="mb-10 md:mb-12 flex flex-col gap-4 items-start">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarBoxLineDuotone className="size-5" />
            Structure
          </div>
          <h2 className="text-3xl md:text-5xl">
            One folder. Fully portable.
          </h2>
          <p className="text-lg text-muted max-w-2xl">
            Copy the skill folder into any Agent Skills-compatible client. No
            monorepo, no shared dependencies, no build step.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-2 border rounded-xl">
            <Surface className="p-6 shadow-md shadow-background-inverse/6 border-[0.5px] border-border/60 rounded-lg font-mono text-sm leading-loose">
              <div className="text-muted">better-sol/</div>
              <div className="pl-4">SKILL.md</div>
              <div className="pl-4 text-muted">references/</div>
              <div className="pl-8">architecture-playbook.md</div>
              <div className="pl-8">program-patterns.md</div>
              <div className="pl-8">sdk-reference.md</div>
              <div className="pl-8 text-muted">... 47 more</div>
              <div className="pl-4 text-muted">examples/</div>
              <div className="pl-8">counter.ts</div>
              <div className="pl-8">counter-client.ts</div>
              <div className="pl-8">counter.test.ts</div>
              <div className="pl-8">token-rewards.ts</div>
              <div className="pl-8">transaction-card.md</div>
            </Surface>
          </div>

          <div className="flex flex-col gap-6 justify-center">
            {[
              {
                icon: SolarCheckCircleLineDuotone,
                title: "Self-contained",
                description:
                  "Every file is in one folder. No external dependencies, no monorepo references, no build step.",
              },
              {
                icon: SolarBoltLineDuotone,
                title: "Progressive disclosure",
                description:
                  "SKILL.md is 181 lines. References load on demand based on the task mode.",
              },
              {
                icon: SolarUsersGroupRoundedLineDuotone,
                title: "Cross-referenced",
                description:
                  "Every reference links to related files. The agent follows connections naturally.",
              },
              {
                icon: SolarWalletMoneyLineDuotone,
                title: "Working examples",
                description:
                  "TypeScript program definitions, typed clients, LiteSVM tests, token CPI patterns, and UI components.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border-[0.5px]">
                  <item.icon className="size-5 text-accent" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-serif font-bold">{item.title}</span>
                  <span className="text-sm text-muted leading-relaxed">
                    {item.description}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SectionDivider />

      <div className="inner border-x py-20 md:py-24 px-6 md:px-8">
        <div className="flex flex-col items-center gap-6 md:gap-8 text-center max-w-xl mx-auto">
          <div className="flex items-center gap-1 border pl-2 pr-4 py-2 rounded-xl">
            <SolarRocketLineDuotone className="size-5" />
            Get Started
          </div>
          <h2 className="text-3xl md:text-5xl">
            Drop it in. Start building.
          </h2>
          <p className="text-lg md:text-xl text-muted">
            Copy the skill folder, open your agent, and ask it to build
            something on Solana.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <a
              href={`${repo}/SKILL.md`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button>
                <SolarBoxLineDuotone className="size-5" />
                View on GitHub
              </Button>
            </a>
            <Link to="/docs/$" params={{ _splat: "your-first-program" }}>
              <Button variant="outline">
                Read the Docs <SolarArrowRightLineDuotone className="size-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
