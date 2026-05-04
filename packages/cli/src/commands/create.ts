import { intro, outro, spinner, text, confirm, isCancel, cancel } from "@clack/prompts";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createProgramKeypair } from "../keypair";
import { ensureDirectory, fileExists } from "../path";
import type { CreateOptions } from "../types";

export async function create(nameArg: string | undefined, options: CreateOptions): Promise<void> {
  intro("better-sol create");

  const name = nameArg ?? await text({ message: "Program name", placeholder: "counter", validate: validateName });
  if (isCancel(name)) return cancel("Create cancelled");

  const programName = String(name);
  const directory = options.dir ?? "programs";
  const programPath = join(process.cwd(), directory, `${programName}.ts`);
  const keypairPath = join(process.cwd(), ".better-sol", `${programName}.json`);

  if (fileExists(programPath) && !options.force) {
    const overwrite = await confirm({ message: `${directory}/${programName}.ts already exists. Overwrite?`, initialValue: false });
    if (isCancel(overwrite) || !overwrite) return cancel("Create cancelled");
  }

  const s = spinner();
  s.start("Generating program keypair");
  const keypair = await createProgramKeypair(keypairPath, options.force);
  s.message("Writing program template");
  await ensureDirectory(join(process.cwd(), directory));
  await writeFile(programPath, template(programName, keypair.publicKey));
  s.stop("Program created");

  outro(`Created ${directory}/${programName}.ts\nProgram: ${keypair.publicKey}\nKeypair: .better-sol/${programName}.json`);
}

function validateName(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return "Enter a program name.";
  if (!/^[a-z][a-z0-9_]*$/.test(value)) return "Use lowercase letters, numbers, and underscores. Start with a letter.";
  return undefined;
}

function template(name: string, address: string): string {
  return `import { bs, cpi } from "better-sol/program";

const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
  isActive: bs.bool(),
}).derive((seed) => ["counter", seed.authority]);

export const ${name} = bs.program(
  {
    name: "${name}",
    address: "${address}",
    accounts: { Counter },
    errors: {
      Unauthorized: "Only the authority can update this counter",
      NotActive: "Counter is not active",
    },
  },
  ix => ({
    initialize: ix({
      accounts: {
        counter: bs.init(Counter),
        authority: bs.signer(),
      },
      args: { initialValue: bs.u64() },
      run: ({ counter, authority }, { initialValue }) => {
        counter.count = initialValue;
        counter.authority = authority;
        counter.isActive = true;
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
        ctx.require(counter.isActive, "NotActive");
        counter.count += amount;
      },
    }),
  })
);

// Usage:
//   import { betterSol, keypairFile } from "better-sol";
//   const sol = await betterSol({ cluster: "devnet", payer: keypairFile("./keypair.json"), programs: { ${name} } });
//   await sol.${name}.initialize({ counter: addr, authority: sol.payer, initialValue: 0n });
`;
}
