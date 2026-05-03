export type Cluster = "devnet" | "testnet" | "mainnet-beta" | "localnet";

export type CliConfig = {
  readonly programs: string;
  readonly cluster: Cluster;
  readonly keypair: string | null;
  readonly out: string;
};

export type DeployOptions = {
  readonly src: string | undefined;
  readonly program: string | undefined;
  readonly cluster: Cluster | undefined;
  readonly keypair: string | undefined;
  readonly verify: boolean;
  readonly dryRun: boolean;
  readonly output: string | undefined;
  readonly compilerUrl: string | undefined;
  readonly apiKey: string | undefined;
};

export type CreateOptions = {
  readonly dir: string | undefined;
  readonly force: boolean;
};

export type VerifyOptions = {
  readonly programId: string | undefined;
  readonly libName: string | undefined;
  readonly mountPath: string | undefined;
};

export type GenerateDbOptions = {
  readonly orm: string | undefined;
  readonly dialect: string | undefined;
  readonly out: string | undefined;
  readonly src: string | undefined;
  readonly merge: boolean;
};
