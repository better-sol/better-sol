export type Cluster = "devnet" | "testnet" | "mainnet" | "localnet";

export type CliConfig = {
  readonly programs: string;
  readonly cluster: Cluster;
  readonly out: string;
};

export type DeployOptions = {
  readonly src: string | undefined;
  readonly program: string | undefined;
  readonly cluster: Cluster | undefined;
  readonly verify: boolean;
  readonly dryRun: boolean;
  readonly output: string | undefined;
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
  readonly dialect: string | undefined;
  readonly out: string | undefined;
  readonly src: string | undefined;
};
