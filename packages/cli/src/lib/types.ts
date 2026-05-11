export type Cluster = "devnet" | "testnet" | "mainnet" | "localnet";

export type CliConfig = {
  readonly programs: string;
  readonly cluster: Cluster;
  readonly out: string;
  readonly payer?: string;
};

export type OutputOptions = {
  readonly json: boolean;
  readonly interactive: boolean;
};

export type InitOptions = OutputOptions & {
  readonly force: boolean;
  readonly skipInstall: boolean;
  readonly yes: boolean;
};

export type DeployOptions = OutputOptions & {
  readonly src: string | undefined;
  readonly program: string | undefined;
  readonly cluster: Cluster | undefined;
  readonly payer: string | undefined;
  readonly verify: boolean;
  readonly dryRun: boolean;
  readonly output: string | undefined;
};

export type CreateOptions = OutputOptions & {
  readonly dir: string | undefined;
  readonly force: boolean;
  readonly yes: boolean;
};

export type VerifyOptions = OutputOptions & {
  readonly programId: string | undefined;
  readonly libName: string | undefined;
  readonly mountPath: string | undefined;
};

export type GenerateDbOptions = OutputOptions & {
  readonly dialect: string | undefined;
  readonly out: string | undefined;
  readonly src: string | undefined;
};

export type GenerateIdlOptions = OutputOptions & {
  readonly out: string | undefined;
  readonly name: string | undefined;
  readonly cluster: string | undefined;
};
