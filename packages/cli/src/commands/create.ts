import { intro, outro, spinner, text, confirm, isCancel, cancel } from "@clack/prompts";
import { writeFile } from "node:fs/promises";
import { createKeypair } from "#lib/keypair";
import { BETTER_SOL_DIR, cwdJoin, ensureDirectory, fileExists } from "#lib/fs";
import type { CreateOptions } from "#lib/types";
import { writeJson } from "./shared";

export async function create(nameArg: string | undefined, options: CreateOptions): Promise<void> {
  if (options.json !== true) intro("better-sol create");

  if (nameArg === undefined && !options.interactive) {
    throw new Error("Program name is required in non-interactive mode.");
  }

  const name = nameArg ?? await text({ message: "Program name", placeholder: "counter", validate: validateName });
  if (isCancel(name)) return cancel("Create cancelled");

  const programName = String(name);
  const directory = options.dir ?? "programs";
  const programPath = cwdJoin(directory, `${programName}.ts`);
  const keypairPath = cwdJoin(BETTER_SOL_DIR, `${programName}.json`);

  if (fileExists(programPath) && !options.force) {
    if (!options.interactive) {
      throw new Error(`${directory}/${programName}.ts already exists. Use --force to overwrite in non-interactive mode.`);
    }
    const overwrite = await confirm({ message: `${directory}/${programName}.ts already exists. Overwrite?`, initialValue: false });
    if (isCancel(overwrite) || !overwrite) return cancel("Create cancelled");
  }

  const s = options.json === true ? undefined : spinner();
  s?.start("Generating program keypair");
  const keypair = await createKeypair(keypairPath, options.force);
  s?.message("Writing program template");
  await ensureDirectory(cwdJoin(directory));
  await writeFile(programPath, template(programName, keypair.publicKey, directory));
  s?.stop("Program created");

  if (options.json === true) {
    writeJson({
      ok: true,
      command: "create",
      programName,
      programAddress: keypair.publicKey,
      programPath: `${directory}/${programName}.ts`,
      keypairPath: `${BETTER_SOL_DIR}/${programName}.json`,
      next: `npx @better-sol/cli@alpha deploy --program ${programName} --json`,
    });
    return;
  }

  outro(`Created ${directory}/${programName}.ts\n  Program:  ${keypair.publicKey}\n  Keypair:  ${BETTER_SOL_DIR}/${programName}.json`);
}

function validateName(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return "Enter a program name.";
  if (!/^[a-z][a-z0-9_]*$/.test(value)) return "Use lowercase letters, numbers, and underscores. Start with a letter.";
  return undefined;
}

function template(name: string, address: string, directory: string): string {
  const normalizedDirectory = directory.replace(/\/+$/, "");
  const importPath = normalizedDirectory.startsWith(".")
    ? `${normalizedDirectory}/${name}`
    : `./${normalizedDirectory}/${name}`;

  return `import { bs } from "better-sol/program";

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

// Example client usage from another file:
//   import { betterSol, keypairFile } from "better-sol";
//   import { ${name} } from "${importPath}";
//
//   const sol = await betterSol({ cluster: "devnet", payer: keypairFile("./keypair.json"), programs: { ${name} } });
//   const counterAddress = await sol.${name}.accounts.Counter.derive({ authority: sol.payer });
//
//   await sol.${name}.initialize({ counter: counterAddress, initialValue: 0n });
//   await sol.${name}.increment({ counter: counterAddress, amount: 1n });
`;
}
