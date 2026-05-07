#!/usr/bin/env node
import { cancel, log } from "@clack/prompts";
import { Command } from "commander";
import { fileURLToPath } from "node:url";
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
  .description("TypeScript-first Solana program tooling — run with npx @better-sol/cli")
  .version(process.env.BETTER_SOL_CLI_VERSION ?? "0.1.0");

cli
  .command("init")
  .description("Initialize a better-sol project")
  .option("--force", "overwrite existing files", false)
  .option("--skip-install", "skip installing dependencies", false)
  .action((options: InitOptions) => run(() => init(options)));

cli
  .command("create")
  .description("Create a new better-sol program")
  .argument("[name]", "program name")
  .option("--dir <dir>", "program directory", "programs")
  .option("--force", "overwrite existing files", false)
  .action((name: string | undefined, options: CreateOptions) => run(() => create(name, options)));

cli
  .command("login")
  .description("Save your compiler API key")
  .action(() => run(() => login()));

cli
  .command("deploy")
  .description("Generate Rust, compile, and deploy programs")
  .option("--src <glob>", "program source glob")
  .option("--program <name>", "target a specific program by name")
  .option("--payer <path>", "payer keypair path")
  .option("--cluster <cluster>", "devnet, testnet, mainnet, or localnet")
  .option("--verify", "write generated Rust for verified builds", false)
  .option("--dry-run", "generate and validate without compiling or deploying", false)
  .option("--output <dir>", "generated Rust output directory")
  .action((options: DeployOptions) => run(() => deploy(options)));

const generate = cli.command("generate").description("Generate derived artifacts");

generate
  .command("db")
  .description("Generate a database schema from account definitions")
  .option("--dialect <dialect>", "postgres, mysql, or sqlite", "postgres")
  .option("--out <path>", "output file", "src/db/better-sol.ts")
  .option("--src <glob>", "program source glob")
  .action((options: GenerateDbOptions) => run(() => generateDb(options)));

generate
  .command("idl")
  .description("Generate a typed Better Sol program from an IDL file or on-chain program address")
  .argument("<source>", "path to IDL JSON file or on-chain program address")
  .option("--out <path>", "output TypeScript file (default: generated/<name>.ts)")
  .option("--name <name>", "program name override (default: derived from IDL)")
  .option("--cluster <cluster>", "cluster for on-chain IDL fetch (mainnet, devnet, testnet, localnet)", "mainnet")
  .action((source: string, options: GenerateIdlOptions) => run(() => generateIdl(source, options)));

cli
  .command("verify")
  .description("Submit a deployed program for OtterSec verified-builds")
  .argument("[program]", "program name or program ID")
  .option("--program-id <programId>", "program ID to verify")
  .option("--lib-name <name>", "Rust library name (defaults to program name)")
  .option("--mount-path <path>", "subdirectory in repo where Cargo.toml lives (defaults to generated/<name>)")
  .action((program: string | undefined, options: VerifyOptions) => run(() => verify(program, options)));


if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  cli.parse(process.argv);
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
