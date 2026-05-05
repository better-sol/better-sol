import { Button, Surface, Tabs } from "@heroui/react";
import { createFileRoute } from "@tanstack/react-router";
import SolarArrowRightLineDuotone from "~icons/solar/arrow-right-line-duotone";
import SolarConfettiLineDuotone from "~icons/solar/confetti-line-duotone";
import SolarPlayLineDuotone from "~icons/solar/play-line-duotone";
import { HighlightCode } from "#/components/highlight-code";

export const Route = createFileRoute("/_layout/")({ component: Home });

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

function Home() {
  return (
    <>
      <div className="relative min-h-lvh flex items-end">
        <div className="inner relative flex h-full flex-col gap-20 border-x">
          <div className="grid grid-cols-2 items-end gap-12 px-8 pt-20">
            <div className="flex flex-col items-start gap-4">
              <a href="#" className="inline-flex h-10 items-center gap-2 rounded-xl border-[0.5px] bg-surface pl-2 pr-4 text-sm font-medium transition-all hover:bg-surface-secondary">
                <SolarConfettiLineDuotone /> TypeScript-first Solana DX
              </a>
              <h1 className="text-5xl font-bold">
                The fastest way to go from idea to Solana program.
              </h1>
            </div>
            <div className="flex flex-col gap-4">
              <p className="text-xl">
                Better Sol gives you one TypeScript definition for program logic, account types, client calls, and SDK autocomplete. Less boilerplate. Fewer mismatches. Faster shipping.
              </p>
              <div className="flex gap-1">
                <Button>
                  Get Started <SolarArrowRightLineDuotone />
                </Button>
                <Button variant="outline">
                  <SolarPlayLineDuotone /> Open Playground
                </Button>
              </div>
            </div>
          </div>

          <div className="relative h-full flex flex-col gap-8 px-8 pt-8">
            <video src="/hero.mp4" autoPlay loop muted playsInline className="absolute left-0 top-0 size-full object-cover" />

            <Tabs>
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
        <div className="inner border-x">
        </div>
      </div>
    </>
  );
}
