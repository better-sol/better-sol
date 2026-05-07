export type PrimitiveType =
  | "u8" | "u16" | "u32" | "u64" | "u128"
  | "i8" | "i16" | "i32" | "i64" | "i128"
  | "f32" | "f64"
  | "bool" | "pubkey" | "string" | "bytes";

type WrappedType = {
  readonly kind: "option";
  readonly inner: IrType;
} | {
  readonly kind: "vec";
  readonly inner: IrType;
  readonly max: number;
} | {
  readonly kind: "array";
  readonly inner: IrType;
  readonly size: number;
};

export type IrType = PrimitiveType | WrappedType | { readonly kind: "struct_zc_ref"; readonly name: string };

export type IrAccountField = {
  readonly name: string;
  readonly type: IrType;
};

export type IrAccount = {
  readonly name: string;
  readonly fields: readonly IrAccountField[];
  readonly zeroCopy: boolean;
  readonly seeds: readonly IrSeed[];
  readonly space: number;
  readonly hasOneFields: readonly string[];
};

export type IrSeed = {
  readonly kind: "literal";
  readonly value: string;
} | {
  readonly kind: "field";
  readonly fieldName: string;
};

export type IrError = {
  readonly name: string;
  readonly message: string;
};

export type IrEventField = {
  readonly name: string;
  readonly type: IrType;
};

export type IrEvent = {
  readonly name: string;
  readonly fields: readonly IrEventField[];
};

export type IrStructZC = {
  readonly name: string;
  readonly fields: readonly IrAccountField[];
};

type AccountConstraint =
  | { readonly kind: "init"; accountName: string }
  | { readonly kind: "initIfNeeded"; accountName: string }
  | { readonly kind: "mut"; accountName: string }
  | { readonly kind: "close"; accountName: string; refundTo: string }
  | { readonly kind: "realloc"; accountName: string; space: number }
  | { readonly kind: "signer" }
  | { readonly kind: "mint"; mutable: boolean }
  | { readonly kind: "tokenAccount"; mutable: boolean }
  | { readonly kind: "tokenProgram" }
  | { readonly kind: "token2022Program" }
  | { readonly kind: "systemProgram" }
  | { readonly kind: "clock" }
  | { readonly kind: "remaining"; itemType: "account" | "tokenAccount" | "signer"; accountName?: string }
  | { readonly kind: "bare"; accountName: string };

export type IrInstructionAccount = {
  readonly name: string;
  readonly constraint: AccountConstraint;
};

export type IrInstructionArg = {
  readonly name: string;
  readonly type: IrType;
};

export type IrInstruction = {
  readonly name: string;
  readonly accounts: readonly IrInstructionAccount[];
  readonly args: readonly IrInstructionArg[];
  readonly body: string;
  readonly returnType: IrType | undefined;
};

export type IrProgram = {
  readonly name: string;
  readonly address: string;
  readonly accounts: readonly IrAccount[];
  readonly instructions: readonly IrInstruction[];
  readonly errors: readonly IrError[];
  readonly events: readonly IrEvent[];
  readonly structsZC: readonly IrStructZC[];
};
