import { Button, Surface } from "@heroui/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import SolarCheckReadLineDuotone from "~icons/solar/check-read-line-duotone";
import SolarArrowRightLineDuotone from "~icons/solar/arrow-right-line-duotone";
import SolarCodeLineDuotone from "~icons/solar/code-line-duotone";
import SolarShieldCheckLineDuotone from "~icons/solar/shield-check-line-duotone";
import SolarPlanetLineDuotone from "~icons/solar/planet-line-duotone";
import SolarBoxLineDuotone from "~icons/solar/box-line-duotone";
import SolarPaletteLineDuotone from "~icons/solar/palette-line-duotone";
import SolarRocketLineDuotone from "~icons/solar/rocket-line-duotone";
import SolarBookLineDuotone from "~icons/solar/book-line-duotone";

export const Route = createFileRoute("/_layout/superskill")({
  component: Superskill,
});

const repo = "https://github.com/powxenv/better-sol/blob/main/skills/better-sol";
const installCommand = "npx skills add powxenv/better-sol@better-sol --yes";

const modes = [
  {
    icon: SolarCodeLineDuotone,
    label: "Build",
    description:
      "Programs, typed clients, LiteSVM tests, deploy, IDL import, dApp architecture, advanced Solana.",
    count: 9,
  },
  {
    icon: SolarBookLineDuotone,
    label: "Learn",
    description:
      "Structured tracks from beginner to advanced. Solana fundamentals, web3 primitives, cookbook recipes.",
    count: 4,
  },
  {
    icon: SolarPlanetLineDuotone,
    label: "Domain",
    description:
      "DeFi, tokens, NFTs, DAOs, oracles, cross-chain, stablecoins, data pipelines, mobile, sybil resistance.",
    count: 11,
  },
  {
    icon: SolarShieldCheckLineDuotone,
    label: "Secure",
    description:
      "Attack catalog, threat modeling, economic security, severity calibration, exploit regression tests.",
    count: 7,
  },
  {
    icon: SolarPaletteLineDuotone,
    label: "Design",
    description:
      "Brand, transaction UX, multi-chain UI, dApp state, number formatting, accessibility, motion.",
    count: 8,
  },
  {
    icon: SolarRocketLineDuotone,
    label: "Launch",
    description:
      "Strategy, tokenomics, pitch decks, grants, marketing, product review, go-to-market.",
    count: 9,
  },
] as const;

function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="text-xs text-muted hover:text-foreground transition-colors"
    >
      {copied ? (
        <span className="flex items-center gap-1.5">
          <SolarCheckReadLineDuotone className="size-3.5 text-success" />
          Copied
        </span>
      ) : (
        "Copy"
      )}
    </button>
  );
}

function InstallBlock() {
  return (
    <div className="p-1 border rounded-xl max-w-xl w-full">
      <Surface className="flex items-center gap-3 rounded-lg border-[0.5px] px-4 py-3">
        <span className="text-muted select-none font-mono text-sm shrink-0">$</span>
        <code className="text-sm truncate flex-1">{installCommand}</code>
        <div className="w-px h-4 bg-border shrink-0" />
        <CopyButton text={installCommand} />
      </Surface>
    </div>
  );
}

function Superskill() {
  return (
    <>
      <div className="inner border-x min-h-[80lvh] flex flex-col items-center justify-center px-6 py-24 md:py-32">
        <div className="flex flex-col items-center gap-6 text-center max-w-2xl">
          <h1 className="text-4xl md:text-6xl leading-[1.08] tracking-tight">
            Everything your agent needs to build on Solana.
          </h1>

          <p className="text-lg md:text-xl text-muted leading-relaxed max-w-lg">
            53 references covering programs, clients, testing, security, DeFi,
            tokens, NFTs, DAOs, oracles, cross-chain, frontend, tokenomics, and
            product strategy. One install.
          </p>

          <div className="flex flex-col items-center gap-4 mt-4 w-full">
            <InstallBlock />
            <div className="flex gap-2">
              <a href={`${repo}/SKILL.md`} target="_blank" rel="noopener noreferrer">
                <Button>
                  <SolarBoxLineDuotone className="size-4" />
                  View on GitHub
                </Button>
              </a>
              <Link to="/docs/$" params={{ _splat: "agent-skill" }}>
                <Button variant="outline">
                  Read the Docs
                  <SolarArrowRightLineDuotone className="size-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="border-y h-14">
        <div className="inner border-x" />
      </div>

      <div className="inner border-x py-20 md:py-28 px-6 md:px-8">
        <div className="flex flex-col items-center gap-3 mb-14 md:mb-16 text-center">
          <h2 className="text-3xl md:text-4xl tracking-tight">
            Six modes. One skill.
          </h2>
          <p className="text-muted max-w-md">
            The skill routes to the right reference based on the task.
            Each mode loads only what the context requires.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden max-w-4xl mx-auto">
          {modes.map((mode) => (
            <div
              key={mode.label}
              className="bg-background p-8 flex flex-col gap-4 group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <mode.icon className="size-5 text-accent" />
                  <span className="font-serif text-lg font-bold">{mode.label}</span>
                </div>
                <span className="text-xs text-muted tabular-nums">{mode.count} refs</span>
              </div>
              <p className="text-sm text-muted leading-relaxed">
                {mode.description}
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-8 mt-12 text-sm text-muted">
          <span>53 references</span>
          <span className="size-1 rounded-full bg-border" />
          <span>10 examples</span>
          <span className="size-1 rounded-full bg-border" />
          <span>63,000 words</span>
        </div>
      </div>

      <div className="border-y h-14">
        <div className="inner border-x" />
      </div>

      <div className="inner border-x py-24 md:py-32 px-6">
        <div className="flex flex-col items-center gap-6 text-center max-w-lg mx-auto">
          <h2 className="text-3xl md:text-5xl tracking-tight leading-tight">
            Drop it in. Start building.
          </h2>
          <p className="text-muted text-lg leading-relaxed">
            Install the skill, open your agent, and ask it to build something on
            Solana. Programs, clients, tests, security, DeFi, tokenomics. One
            skill handles all of it.
          </p>
          <div className="mt-4 w-full">
            <InstallBlock />
          </div>
          <div className="flex gap-2 mt-2">
            <a href={`${repo}/SKILL.md`} target="_blank" rel="noopener noreferrer">
              <Button>
                <SolarBoxLineDuotone className="size-4" />
                View on GitHub
              </Button>
            </a>
            <Link to="/docs/$" params={{ _splat: "agent-skill" }}>
              <Button variant="outline">
                Read the Docs
                <SolarArrowRightLineDuotone className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
