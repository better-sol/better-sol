import { intro, outro, spinner, confirm, select as clackSelect, isCancel, cancel, log } from "@clack/prompts";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { createKeypair } from "#lib/keypair";
import { cwdJoin, fileExists } from "#lib/fs";
import type { InitOptions } from "#lib/types";
import { CLI_COMMAND, writeJson } from "./shared";

const PAYER_KEYPAIR_PATH = "keypair.json";
const GITIGNORE_ENTRIES = [".better-sol/", "generated/", "keypair.json", "node_modules/"];
const SOLANA_DEFAULT_KEYPAIR_PATH = join(homedir(), ".config", "solana", "id.json");

type PackageManager = "npm" | "bun" | "pnpm" | "yarn";

export async function init(options: InitOptions): Promise<void> {
  if (options.json !== true) intro("better-sol init");

  const payerPath = await resolvePayerPath(options);

  if (payerPath === cwdJoin(PAYER_KEYPAIR_PATH)) {
    if (existsSync(payerPath) && !options.force) {
      if (options.json !== true) log.step("Payer keypair already exists at keypair.json");
    } else {
      const s = options.json === true ? undefined : spinner();
      s?.start("Generating payer keypair");
      const keypair = await createKeypair(payerPath, options.force);
      s?.stop("Payer keypair created");
      if (options.json !== true) {
        log.step(`Address: ${keypair.publicKey}`);
        log.step(`Saved:   keypair.json`);
        log.warn("Keep this file safe. It contains your private key. Never commit it to git.");
      }
    }
  } else {
    if (options.json !== true) log.step(`Using existing keypair at ${payerPath}`);
    await writePayerConfig(options);
  }

  await ensureGitignore(options);
  ensureProgramsDir(options);

  if (!options.skipInstall) {
    await installDependencies(options);
  }

  if (options.json === true) {
    writeJson({
      ok: true,
      command: "init",
      payerPath,
      programsDir: "programs",
      next: [`${CLI_COMMAND} create <program-name> --yes --json`, `${CLI_COMMAND} deploy --json`],
    });
    return;
  }

  outro(`Project ready.\n  Next: ${CLI_COMMAND} create <program-name>\n  Then: ${CLI_COMMAND} deploy`);
}

async function resolvePayerPath(options: InitOptions): Promise<string> {
  const localPath = cwdJoin(PAYER_KEYPAIR_PATH);
  if (existsSync(localPath)) return localPath;

  if (existsSync(SOLANA_DEFAULT_KEYPAIR_PATH)) {
    if (!options.interactive) return SOLANA_DEFAULT_KEYPAIR_PATH;

    const useGlobal = await confirm({
      message: `Found an existing Solana keypair at ~/.config/solana/id.json. Use it as your payer?`,
      initialValue: true,
    });
    if (isCancel(useGlobal)) {
      cancel("Init cancelled");
      process.exit(0);
    }
    if (useGlobal) return SOLANA_DEFAULT_KEYPAIR_PATH;
  }

  return cwdJoin(PAYER_KEYPAIR_PATH);
}

async function ensureGitignore(options: InitOptions): Promise<void> {
  const gitignorePath = cwdJoin(".gitignore");

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${GITIGNORE_ENTRIES.join("\n")}\n`);
    if (options.json !== true) log.step("Created .gitignore");
    return;
  }

  const existing = readFileSync(gitignorePath, "utf8");
  const existingLines = new Set(existing.split("\n").map((line) => line.trim()));
  const missing = GITIGNORE_ENTRIES.filter((entry) => !existingLines.has(entry));

  if (missing.length === 0) return;

  const updated = existing.endsWith("\n")
    ? `${existing}${missing.join("\n")}\n`
    : `${existing}\n${missing.join("\n")}\n`;
  writeFileSync(gitignorePath, updated);
  if (options.json !== true) log.step("Updated .gitignore");
}

function ensureProgramsDir(options: InitOptions): void {
  const programsDir = cwdJoin("programs");
  if (!existsSync(programsDir)) {
    mkdirSync(programsDir, { recursive: true });
    if (options.json !== true) log.step("Created programs/ directory");
  }
}

async function installDependencies(options: InitOptions): Promise<void> {
  const hasPackageJson = existsSync(cwdJoin("package.json"));

  if (hasPackageJson) {
    const pkg = JSON.parse(readFileSync(cwdJoin("package.json"), "utf8")) as Record<string, unknown>;
    const deps = pkg.dependencies as Record<string, string> | undefined;
    if (deps !== undefined && "better-sol" in deps) {
      if (options.json !== true) log.step("better-sol is already installed");
      return;
    }

    const shouldInstall = !options.interactive || await confirm({
      message: "Install better-sol?",
      initialValue: true,
    });
    if (isCancel(shouldInstall) || !shouldInstall) return;

    const pm = await detectPackageManager();
    installPackage(pm, "better-sol", options);
    return;
  }

  const shouldCreate = !options.interactive || await confirm({
    message: "No package.json found. Create one with better-sol?",
    initialValue: true,
  });
  if (isCancel(shouldCreate) || !shouldCreate) return;

  const pm = options.interactive ? await selectPackageManager() : await detectPackageManager();
  createPackageJson(options);
  installPackage(pm, "better-sol", options);
}

async function detectPackageManager(): Promise<PackageManager> {
  if (existsSync(cwdJoin("bun.lock"))) return "bun";
  if (existsSync(cwdJoin("bun.lockb"))) return "bun";
  if (existsSync(cwdJoin("pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(cwdJoin("yarn.lock"))) return "yarn";
  return "npm";
}

async function selectPackageManager(): Promise<PackageManager> {
  const result = await clackSelect<PackageManager>({
    message: "Package manager",
    options: [
      { value: "npm", label: "npm" },
      { value: "bun", label: "bun" },
      { value: "pnpm", label: "pnpm" },
      { value: "yarn", label: "yarn" },
    ],
  });
  if (isCancel(result)) {
    cancel("Init cancelled");
    process.exit(0);
  }
  return result;
}

function createPackageJson(options: InitOptions): void {
  const projectName = cwdJoin(".").split("/").pop() ?? "my-project";
  const pkg = {
    name: projectName,
    type: "module",
    dependencies: {} as Record<string, string>,
  };
  writeFileSync(cwdJoin("package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  if (options.json !== true) log.step("Created package.json");
}

function installPackage(pm: PackageManager, packageName: string, options: InitOptions): void {
  const s = options.json === true ? undefined : spinner();
  s?.start(`Installing ${packageName} with ${pm}`);

  const commands: Record<PackageManager, string> = {
    npm: `npm install ${packageName}`,
    bun: `bun add ${packageName}`,
    pnpm: `pnpm add ${packageName}`,
    yarn: `yarn add ${packageName}`,
  };

  try {
    execSync(commands[pm], { encoding: "utf8", timeout: 120_000, stdio: "pipe" });
    s?.stop(`Installed ${packageName}`);
  } catch {
    s?.stop(`Failed to install ${packageName}`);
    if (options.json !== true) log.warn(`Run manually: ${commands[pm]}`);
  }
}

async function writePayerConfig(options: InitOptions): Promise<void> {
  const configPath = cwdJoin("better-sol.config.ts");
  if (fileExists(configPath)) return;

  writeFileSync(
    configPath,
    [
      `import { homedir } from "node:os";`,
      `import { join } from "node:path";`,
      `import { defineConfig } from "@better-sol/cli";`,
      ``,
      `export default defineConfig({`,
      `  payer: join(homedir(), ".config", "solana", "id.json"),`,
      `});`,
    ].join("\n"),
  );
  if (options.json !== true) log.step("Created better-sol.config.ts");
}
