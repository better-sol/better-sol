import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const SOLANA_INSTALL_DIR = join(homedir(), ".local", "share", "solana", "install", "active_release", "bin");

export function resolveSolanaBinary(): string | null {
  try {
    execSync("solana --version", { stdio: "ignore", timeout: 5000 });
    return "solana";
  } catch {
    const installed = join(SOLANA_INSTALL_DIR, "solana");
    try {
      execSync(`"${installed}" --version`, { stdio: "ignore", timeout: 5000 });
      return installed;
    } catch {
      return null;
    }
  }
}

export function installSolanaCli(): void {
  execSync(
    'sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"',
    { encoding: "utf8", timeout: 300_000, stdio: "pipe" },
  );
}

export function ensureSolanaCli(): string {
  const existing = resolveSolanaBinary();
  if (existing !== null) return existing;

  installSolanaCli();

  const installed = join(SOLANA_INSTALL_DIR, "solana");
  try {
    execSync(`"${installed}" --version`, { stdio: "ignore", timeout: 5000 });
    return installed;
  } catch {
    throw new Error(
      `Solana CLI installed but binary not found at: ${installed}\n` +
      "Try restarting your terminal, then re-run deploy.",
    );
  }
}
