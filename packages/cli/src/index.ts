#!/usr/bin/env node
import { cancel, log } from "@clack/prompts";
import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { create } from "./commands/create";
import { deploy } from "./commands/deploy";
import { generateDb } from "./commands/generate";
import { login } from "./commands/login";
import { verify } from "./commands/verify";
import { defineConfig } from "./config";
import type { CreateOptions, DeployOptions, GenerateDbOptions, VerifyOptions } from "./types";

export { defineConfig };
export type { CliConfig, CreateOptions, DeployOptions, GenerateDbOptions, VerifyOptions } from "./types";
export const cliName = "@better-sol/cli";

const cli = new Command();

cli
  .name("better-sol")
  .description("TypeScript-first Solana program tooling — run with npx @better-sol/cli")
  .version("0.0.0");

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
