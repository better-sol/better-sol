#!/usr/bin/env node
import { cancel, log } from "@clack/prompts";
import { Command } from "commander";
import { init } from "./commands/init";
import { create } from "./commands/create";
import { deploy } from "./commands/deploy";
import { generateDb } from "./commands/generate/db";
import { generateIdl } from "./commands/generate/idl";
import { login } from "./commands/login";
import { verify } from "./commands/verify";
import { defineConfig } from "#lib/config";
import type { InitOptions, CreateOptions, DeployOptions, GenerateDbOptions, GenerateIdlOptions, VerifyOptions } from "#lib/types";

export { defineConfig };
export type { CliConfig, InitOptions, CreateOptions, DeployOptions, GenerateDbOptions, GenerateIdlOptions, VerifyOptions } from "#lib/types";

const cli = new Command();

cli
  .name("better-sol")
  .description("Write Solana programs in TypeScript. Run with npx @better-sol/cli@alpha")
  .version(process.env.BETTER_SOL_CLI_VERSION ?? "0.1.0");

cli
  .command("init")
  .description("Initialize a better-sol project")
  .option("--force", "overwrite existing files", false)
  .option("--skip-install", "skip installing dependencies", false)
  .option("--yes", "use defaults and do not prompt", false)
  .option("--json", "print machine-readable JSON", false)
  .action((options: Omit<InitOptions, "interactive">, command: Command) => run(() => init({ ...options, interactive: shouldUseInteractive(command) })));

cli
  .command("create")
  .description("Create a new better-sol program")
  .argument("[name]", "program name")
  .option("--dir <dir>", "program directory", "programs")
  .option("--force", "overwrite existing files", false)
  .option("--yes", "use defaults and do not prompt", false)
  .option("--json", "print machine-readable JSON", false)
  .action((name: string | undefined, options: Omit<CreateOptions, "interactive">, command: Command) => run(() => create(name, { ...options, interactive: name === undefined && shouldUseInteractive(command) })));

cli
  .command("login")
  .description("Save your compiler API key")
  .argument("[apiKey]", "compiler API key")
  .option("--json", "print machine-readable JSON", false)
  .action((apiKey: string | undefined, options: { readonly json: boolean }, command: Command) => run(() => login(apiKey, { ...options, interactive: apiKey === undefined && shouldUseInteractive(command) })));

cli
  .command("deploy")
  .description("Compile and deploy programs")
  .option("--src <glob>", "program source glob")
  .option("--program <name>", "target a specific program by name")
  .option("--payer <path>", "payer keypair path")
  .option("--cluster <cluster>", "devnet, testnet, mainnet, or localnet")
  .option("--verify", "write generated Rust for verified builds", false)
  .option("--dry-run", "generate and validate without compiling or deploying", false)
  .option("--output <dir>", "output directory for verified build Rust", "generated")
  .option("--json", "print machine-readable JSON", false)
  .action((options: Omit<DeployOptions, "interactive">) => run(() => deploy({ ...options, interactive: false })));

const generate = cli.command("generate").description("Generate derived artifacts");

generate
  .command("db")
  .description("Generate a database schema from account definitions")
  .option("--dialect <dialect>", "postgres, mysql, or sqlite", "postgres")
  .option("--out <path>", "output file", "src/db/better-sol.ts")
  .option("--src <glob>", "program source glob")
  .option("--json", "print machine-readable JSON", false)
  .action((options: Omit<GenerateDbOptions, "interactive">) => run(() => generateDb({ ...options, interactive: false })));

generate
  .command("idl")
  .description("Generate a typed Better Sol program from an IDL file or on-chain program address")
  .argument("<source>", "path to IDL JSON file or on-chain program address")
  .option("--out <path>", "output TypeScript file (default: generated/<name>.ts)")
  .option("--name <name>", "program name override (default: derived from IDL)")
  .option("--cluster <cluster>", "cluster for on-chain IDL fetch (mainnet, devnet, testnet, localnet)", "mainnet")
  .option("--json", "print machine-readable JSON", false)
  .action((source: string, options: Omit<GenerateIdlOptions, "interactive">) => run(() => generateIdl(source, { ...options, interactive: false })));

cli
  .command("verify")
  .description("Submit a deployed program for OtterSec verified-builds")
  .argument("[program]", "program name or program ID")
  .option("--program-id <programId>", "program ID to verify")
  .option("--lib-name <name>", "Rust library name (defaults to program name)")
  .option("--mount-path <path>", "subdirectory in repo where Cargo.toml lives (defaults to generated/<name>)")
  .option("--json", "print machine-readable JSON", false)
  .action((program: string | undefined, options: Omit<VerifyOptions, "interactive">) => run(() => verify(program, { ...options, interactive: false })));

cli.parse(process.argv);

function shouldUseInteractive(command: Command): boolean {
  const optionValues = command.opts() as { readonly yes?: boolean; readonly json?: boolean };
  if (optionValues.yes === true || optionValues.json === true) return false;

  for (const option of command.options) {
    if (command.getOptionValueSource(option.attributeName()) !== "default") return false;
  }

  return true;
}

async function run(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error(message);
    cancel("Command failed");
    process.exitCode = 1;
  }
}
