// ============================================================
// COMPLETE TYPE-SAFE CONTEXT POC
//
// ⚠️ SUPERSEDED by type-safety-complete.ts which proves:
// - All features below PLUS zero-copy, remaining accounts, Token-2022
// - Verified with tsc --strict (zero errors)
//
// This file is kept for reference but may have type inference issues.
// See type-safety-complete.ts for the current working proof.
// ============================================================

// ══════════════════════════════════════════
// TYPE SYSTEM (internal to better-sol/program)
// ══════════════════════════════════════════

type SolTypeMap = {
  u64: bigint
  u8: number
  u32: number
  bool: boolean
  pubkey: string
  i64: bigint
  u128: bigint
}

interface SolField<T extends keyof SolTypeMap = keyof SolTypeMap> {
  readonly __sol: T
}
export declare const u64: SolField<'u64'>
export declare const u8: SolField<'u8'>
export declare const u32: SolField<'u32'>
export declare const bool: SolField<'bool'>
export declare const pubkey: SolField<'pubkey'>
export declare const i64: SolField<'i64'>
export declare const u128: SolField<'u128'>

type InferFields<T extends Record<string, SolField>> = {
  [K in keyof T]: SolTypeMap[T[K]['__sol']]
}

// ── Accounts ──

interface SolAccount<T extends Record<string, SolField>> {
  readonly __fields: T
}
export declare function account<const T extends Record<string, SolField>>(fields: T): SolAccount<T>

// Extract pubkey field names from an account
type PubkeyFields<T extends Record<string, SolField>> = {
  [K in keyof T]: T[K] extends SolField<'pubkey'> ? K : never
}[keyof T]

// ── Errors ──

interface ErrorRegistry<T extends Record<string, string>> {
  readonly __errors: T
}
export declare function defineErrors<const T extends Record<string, string>>(errors: T): ErrorRegistry<T>

// ── Events ──

interface EventRegistry<T extends Record<string, Record<string, SolField>>> {
  readonly __events: T
}
export declare function defineEvents<const T extends Record<string, Record<string, SolField>>>(events: T): EventRegistry<T>

// ── Context: the typed handler context ──
//
// This is the core of the type system.
// TErrors → type-safe require()
// TEvents → type-safe emit() with validated data shapes

type RequireFn<TErrors extends Record<string, string>> = {
  (condition: boolean): void
  (condition: boolean, error: keyof TErrors & string): void
}

type EmitFn<TEvents extends Record<string, Record<string, SolField>>> = {
  <K extends keyof TEvents & string>(
    name: K,
    data: InferFields<TEvents[K]>
  ): void
}

type LogFn = {
  (message: string, ...values: (string | number | bigint | boolean)[]): void
}

interface ProgramContext<
  TErrors extends Record<string, string>,
  TEvents extends Record<string, Record<string, SolField>>,
> {
  require: RequireFn<TErrors>
  emit: EmitFn<TEvents>
  log: LogFn
}

// ── p.* constraints ──

export declare const p: {
  init<T extends Record<string, SolField>>(acct: SolAccount<T>): void
  mut<T extends Record<string, SolField>>(acct: SolAccount<T>): void
  signer(): void
  close<T extends Record<string, SolField>>(acct: SolAccount<T>, refundTo: string): void
  mint(): void
  tokenProgram(): void
  tokenAccount(): { mut(): void }
}

// ── token CPI ──

export declare const token: {
  transfer(p: { from: any; to: any; authority: any; amount: bigint }): void
  mintTo(p: { mint: any; to: any; authority: any; amount: bigint }): void
  burn(p: { from: any; mint: any; authority: any; amount: bigint }): void
}
export declare const sol: { timestamp(): bigint }

// ── ix() instruction builder ──

interface IxConfig<
  TAccounts extends Record<string, any>,
  TArgs extends Record<string, SolField>,
  TErrors extends Record<string, string>,
  TEvents extends Record<string, Record<string, SolField>>,
> {
  accounts: TAccounts
  args?: TArgs
  run: (
    accounts: { [K in keyof TAccounts]: any },
    args: { [K in keyof TArgs]: SolTypeMap[TArgs[K]['__sol']] },
    ctx: ProgramContext<TErrors, TEvents>,
  ) => void
}

export declare function ix<
  TErrors extends Record<string, string>,
  TEvents extends Record<string, Record<string, SolField>>,
  const TAccounts extends Record<string, any>,
  const TArgs extends Record<string, SolField>,
>(config: IxConfig<TAccounts, TArgs, TErrors, TEvents>): IxConfig<TAccounts, TArgs, TErrors, TEvents>

// ── program() ──
//
// Takes errors + events + instructions in one call.
// Type parameters carry TErrors and TEvents through to
// every ix()'s run: callback's ctx parameter.

interface ProgramApi<
  TName extends string,
  TId extends string,
  TErrors extends Record<string, string>,
  TEvents extends Record<string, Record<string, SolField>>,
> {
  readonly name: TName
  readonly id: TId
  readonly errors: TErrors
  readonly events: TEvents
}

export declare function program<
  const TName extends string,
  const TId extends string,
  const TErrors extends Record<string, string>,
  const TEvents extends Record<string, Record<string, SolField>>,
  const TInstructions extends Record<string, IxConfig<any, any, TErrors, TEvents>>,
>(
  config: {
    name: TName
    address: TId
    errors: ErrorRegistry<TErrors>
    events?: EventRegistry<TEvents>
    instructions: TInstructions
  },
): ProgramApi<TName, TId, TErrors, TEvents>


// ╔══════════════════════════════════════════════════════════════╗
// ║  DEVELOPER CODE — THE COMPLETE AMM PROGRAM                  ║
// ╚══════════════════════════════════════════════════════════════╝


// ── Accounts ──

const Config = account({
  admin: pubkey,
  totalPools: u64,
  feeBps: u64,
  bump: u8,
})

const Pool = account({
  tokenAMint: pubkey,
  tokenBMint: pubkey,
  tokenAReserve: pubkey,
  tokenBReserve: pubkey,
  lpMint: pubkey,
  lpSupply: u64,
  feeBps: u64,
  admin: pubkey,
  isActive: bool,
  bump: u8,
})


// ── Errors ──

const errors = defineErrors({
  Unauthorized: 'Caller is not authorized',
  PoolDoesNotExist: 'Pool does not exist or is inactive',
  InsufficientLiquidity: 'Not enough liquidity',
  SlippageExceeded: 'Output below minimum',
  InvalidAmount: 'Amount must be positive',
  InvalidFeeBps: 'Fee too high',
})


// ── Events ──

const events = defineEvents({
  PoolCreated: {
    tokenA: pubkey,
    tokenB: pubkey,
  },
  SwapExecuted: {
    amountIn: u64,
    amountOut: u64,
    fee: u64,
    direction: u8,
  },
  LiquidityAdded: {
    amountA: u64,
    amountB: u64,
    lpTokens: u64,
  },
  FeeUpdated: {
    newFeeBps: u64,
  },
})


// ── Program ──

export const amm = program({
  name: 'amm',
  address: 'AMMxPooL11111111111111111111111111111111111',
  errors,
  events,
  instructions: {

  // ── Initialize config ──
  initializeConfig: ix({
    accounts: {
      config: p.init(Config),
      admin: p.signer(),
    },
    run: ({ config, admin }, ctx) => {
      // No require needed — simple init
      // No events needed for this instruction
    },
  }),

  // ── Create pool ──
  createPool: ix({
    accounts: {
      config: Config,
      pool: p.init(Pool),
      creator: p.signer(),
    },
    args: { feeBps: u64 },
    run: ({ config, pool, creator }, { feeBps }, ctx) => {
      // ✅ ctx.require — autocomplete shows only registered errors
      ctx.require(creator === config.admin, 'Unauthorized')
      ctx.require(feeBps <= 1000n, 'InvalidFeeBps')

      pool.lpSupply = 0n
      pool.feeBps = feeBps
      pool.isActive = true

      config.totalPools += 1n

      // ✅ ctx.emit — autocomplete shows only registered events
      //              data shape is validated against event definition
      ctx.emit('PoolCreated', {
        tokenA: 'some_pubkey',
        tokenB: 'some_pubkey',
      })

      // ❌ ctx.emit('PoolCreated', { tokenA: 'pk' })
      //    → TS error: missing 'tokenB'

      // ❌ ctx.emit('NotAnEvent', {})
      //    → TS error: 'NotAnEvent' not assignable to 'PoolCreated' | 'SwapExecuted' | ...
    },
  }),

  // ── Swap A → B ──
  swapAForB: ix({
    accounts: {
      pool: p.mut(Pool),
      tokenAReserve: p.tokenAccount().mut(),
      tokenBReserve: p.tokenAccount().mut(),
      trader: p.signer(),
    },
    args: { amountIn: u64, minOut: u64 },
    run: ({ pool }, { amountIn, minOut }, ctx) => {
      // ✅ Type-safe require
      ctx.require(pool.isActive, 'PoolDoesNotExist')
      ctx.require(amountIn > 0n, 'InvalidAmount')

      const fee = (amountIn * pool.feeBps) / 10000n
      const netIn = amountIn - fee
      const amountOut = netIn * 1n  // simplified

      ctx.require(amountOut >= minOut, 'SlippageExceeded')

      // ✅ Type-safe emit — event name AND data shape validated
      ctx.emit('SwapExecuted', {
        amountIn: amountIn,
        amountOut: amountOut,
        fee: fee,
        direction: 0,
      })

      // ✅ Structured logging
      ctx.log('Swap: {} in → {} out', amountIn, amountOut)
    },
  }),

  // ── Update fee ──
  updateFee: ix({
    accounts: {
      pool: p.mut(Pool),
      admin: p.signer(),
    },
    args: { newFeeBps: u64 },
    run: ({ pool, admin }, { newFeeBps }, ctx) => {
      ctx.require(admin === pool.admin, 'Unauthorized')
      ctx.require(newFeeBps <= 1000n, 'InvalidFeeBps')

      pool.feeBps = newFeeBps

      // ✅ Event with correct shape
      ctx.emit('FeeUpdated', { newFeeBps })
      ctx.log('Fee updated to {}bps', newFeeBps)
    },
  }),
  },
})


// ══════════════════════════════════════════
// COUNTER PROGRAM — THE COLLISION TEST
// ══════════════════════════════════════════

const Counter = account({
  count: u64,
  authority: pubkey,
  isActive: bool,
})

const counterErrors = defineErrors({
  Unauthorized: 'Not the authority',
  NotActive: 'Not active',
  BelowZero: 'Below zero',
})

export const counter = program({
  name: 'counter',
  address: 'CouNTeR11111111111111111111111111111111111',
  errors: counterErrors,
  instructions: {
    increment: ix({
      accounts: {
        counter: p.mut(Counter),    // account named 'counter'
        authority: p.signer(),
      },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        //     ^^^^^^^ account    ^^^^^^^^^ args  ^^^ ctx
        //     NO collision! ctx is always the 3rd parameter.

        ctx.require(authority === counter.authority, 'Unauthorized')  // ✅
        ctx.require(counter.isActive, 'NotActive')                      // ✅
        counter.count += amount
      },
    }),
  },
})


// ══════════════════════════════════════════
// COMPILE-TIME ERROR EXAMPLES
// ══════════════════════════════════════════

// ❌ ctx.require(false, 'NotAnError')
//    TS2345: '"NotAnError"' is not assignable to '"Unauthorized" | ...'

// ❌ ctx.emit('SwapExecuted', { amountIn: 1n })
//    TS2345: missing 'amountOut', 'fee', 'direction'

// ❌ ctx.emit('NotAnEvent', {})
//    TS2345: '"NotAnEvent"' is not assignable to '"PoolCreated" | "SwapExecuted" | ...'

// ❌ ctx.emit('SwapExecuted', { amountIn: 1n, amountOut: 1n, fee: 1n, direction: 'wrong' })
//    TS2345: 'wrong' is not assignable to number (direction is u8)

// ❌ ctx.require(tokenAReserve.mint === pool.feeBps, '...')
//    TS2367: This condition will always return 'false' since the types 'string' and 'bigint' have no overlap.
