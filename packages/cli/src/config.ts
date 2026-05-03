import { join } from "node:path";
import type { CliConfig, Cluster } from "./types";

const clusterValues: readonly Cluster[] = ["devnet", "testnet", "mainnet-beta", "localnet"];

function isCluster(value: string): value is Cluster {
  return clusterValues.includes(value as Cluster);
}

export function parseCluster(value: string | undefined, fallback: Cluster): Cluster {
  if (value === undefined) return fallback;
  if (isCluster(value)) return value;
  throw new Error(`Unsupported cluster '${value}'. Expected one of: ${clusterValues.join(", ")}`);
}

export async function loadConfig(): Promise<CliConfig> {
  const defaults: CliConfig = {
    programs: "programs/**/*.ts",
    cluster: "devnet",
    keypair: null,
    out: "generated",
  };

  const configPath = join(process.cwd(), "better-sol.config.ts");
  const file = Bun.file(configPath);
  if (!(await file.exists())) return defaults;

  const module = await import(`${configPath}?t=${Date.now()}`) as unknown;
  if (!isConfigModule(module)) return defaults;

  return {
    programs: typeof module.default.programs === "string" ? module.default.programs : defaults.programs,
    cluster: isClusterValue(module.default.cluster) ? module.default.cluster : defaults.cluster,
    keypair: typeof module.default.keypair === "string" ? module.default.keypair : defaults.keypair,
    out: typeof module.default.out === "string" ? module.default.out : defaults.out,
  };
}

type ConfigModule = {
  readonly default: Partial<{
    readonly programs: string;
    readonly cluster: Cluster;
    readonly keypair: string;
    readonly out: string;
  }>;
};

function isConfigModule(value: unknown): value is ConfigModule {
  return typeof value === "object" && value !== null && "default" in value;
}

function isClusterValue(value: unknown): value is Cluster {
  return typeof value === "string" && isCluster(value);
}

export function defineConfig(config: Partial<CliConfig>): Partial<CliConfig> {
  return config;
}
