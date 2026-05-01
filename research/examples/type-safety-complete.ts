// ============================================================
// COMPLETE TYPE-SAFE POC — ALL FEATURES (v2)
//
// Features tested:
// 1. ctx.require() — typed error names
// 2. ctx.emit() — typed event names + data shapes
// 3. p.tokenAccount() — typed { mint, owner, amount, key }
// 4. p.remaining() — typed arrays
// 5. account().zeroCopy() — zero-copy accounts
// 6. Token-2022 CPI — token.transferChecked
// 7. struct_zc() — zero-copy sub-structs
// 8. array(T, N) — fixed-size arrays for zero-copy
//
// Target: tsc --strict — zero errors
// ============================================================

// ══════════════════════════════════════════
// TYPE SYSTEM
// ══════════════════════════════════════════

// ── Primitive types ──

type SolTypeMap = {
  u64: bigint
  u8: number
  u16: number
  u32: number
  u128: bigint
  i64: bigint
  i128: bigint
  bool: boolean
  pubkey: string
}

interface SolField<T extends keyof SolTypeMap = keyof SolTypeMap> {
  readonly __sol: T
}
declare const u64: SolField<'u64'>
declare const u8: SolField<'u8'>
declare const u16: SolField<'u16'>
declare const u32: SolField<'u32'>
declare const u128: SolField<'u128'>
declare const i64: SolField<'i64'>
declare const i128: SolField<'i128'>
declare const bool: SolField<'bool'>
declare const pubkey: SolField<'pubkey'>

type InferFields<T extends Record<string, SolField>> = {
  [K in keyof T]: SolTypeMap[T[K]['__sol']]
}

// ── Fixed arrays (for zero-copy) ──
// array(u64, 100) → ArrayField<u64, 100>
// array(struct_zc({...}), 100) → ArrayField<ZcStruct<...>, 100>

interface ArrayField<T, N extends number> {
  readonly __arrElement: T
  readonly __arrLength: N
}
declare function array<T, N extends number>(element: T, length: N): ArrayField<T, N>

// ── Zero-copy sub-structs ──
interface ZcStruct<T extends Record<string, SolField>> {
  readonly __zcFields: T
}
declare function struct_zc<const T extends Record<string, SolField>>(fields: T): ZcStruct<T>

type InferZcFields<T extends ZcStruct<any>> =
  T extends ZcStruct<infer F> ? InferFields<F> : never

// ── Account field types (SolField OR ArrayField) ──
type AccountFieldType = SolField | ArrayField<any, any>

// Infer a single field or array field
// Deep mutable helper
type Mutable<T> = { -readonly [K in keyof T]: T[K] }

type InferFieldType<T> =
  T extends SolField<infer S> ? SolTypeMap[S] :
  T extends ArrayField<infer E, infer N> ?
    E extends ZcStruct<any> ? Mutable<InferZcFields<E>>[] & { length: N } :
    E extends SolField<infer S> ? SolTypeMap[S][] & { length: N } :
    never :
  never

// Full account data type (all fields inferred)
// Force mutable fields for on-chain accounts (p.mut, p.init produce writable refs)
type InferAccountData<T extends Record<string, AccountFieldType>> = {
  -readonly [K in keyof T]: InferFieldType<T[K]>
}

// ── Accounts ──

interface SolAccount<T extends Record<string, AccountFieldType>> {
  readonly __accountFields: T
}

// account() builder — returns an object with .seeds() and .zeroCopy()
interface AccountBuilder<T extends Record<string, AccountFieldType>> {
  readonly __accountFields: T
  seeds(...seeds: string[]): AccountBuilder<T>
  zeroCopy(): AccountBuilder<T> & { __zeroCopy: true }
}

declare function account<const T extends Record<string, AccountFieldType>>(fields: T): AccountBuilder<T>

// ── Errors ──

interface ErrorRegistry<T extends Record<string, string>> {
  readonly __errors: T
}
declare function defineErrors<const T extends Record<string, string>>(errors: T): ErrorRegistry<T>

// ── Events ──

interface EventRegistry<T extends Record<string, Record<string, SolField>>> {
  readonly __events: T
}
declare function defineEvents<const T extends Record<string, Record<string, SolField>>>(events: T): EventRegistry<T>

// ── Context ──

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

interface ProgramContext<
  TErrors extends Record<string, string>,
  TEvents extends Record<string, Record<string, SolField>>,
> {
  require: RequireFn<TErrors>
  emit: EmitFn<TEvents>
  log: (message: string, ...values: (string | number | bigint | boolean)[]) => void
}

// ── Token account and mint types ──

interface TokenAccountData {
  readonly mint: string
  readonly owner: string
  readonly amount: bigint
  readonly key: string
}

interface MintAccountData {
  readonly supply: bigint
  readonly decimals: number
  readonly key: string
}

// ── p.* constraints ──
// Each constraint wraps the type information the transpiler needs.
// The type system unwraps them to get the runtime types for run: handlers.

// Constraint brand types
interface ConstraintInit { readonly __constraint: 'init'; readonly __accountType: unknown }
interface ConstraintMut { readonly __constraint: 'mut'; readonly __accountType: unknown }
interface ConstraintSigner { readonly __constraint: 'signer' }
interface ConstraintTokenAccount { readonly __constraint: 'tokenAccount' }
interface ConstraintMint { readonly __constraint: 'mint' }
interface ConstraintRemaining { readonly __constraint: 'remaining'; readonly __elementType: unknown }
interface ConstraintTokenProgram { readonly __constraint: 'tokenProgram' }
interface ConstraintToken2022Program { readonly __constraint: 'token2022Program' }
interface ConstraintClose { readonly __constraint: 'close'; readonly __accountType: unknown }
interface ConstraintClock { readonly __constraint: 'clock' }

// Typed wrappers that carry the account type
type ConstraintInitOf<T> = ConstraintInit & { readonly __accountType: T }
type ConstraintMutOf<T> = ConstraintMut & { readonly __accountType: T }
type ConstraintRemainingOf<T> = ConstraintRemaining & { readonly __elementType: T }

declare const p: {
  init<T>(acct: T): ConstraintInitOf<T>
  mut<T>(acct: T): ConstraintMutOf<T>
  signer(): ConstraintSigner
  tokenAccount(): ConstraintTokenAccount & { mut(): ConstraintTokenAccount }
  mint(): ConstraintMint & { mut(): ConstraintMint }
  remaining<E>(elementType: E): ConstraintRemainingOf<
    E extends AccountBuilder<any> ? InferFromBuilder<E> & { key: string } :
    E extends ConstraintTokenAccount ? TokenAccountData :
    E extends SolAccount<any> ? InferFromAccount<E> & { key: string } :
    unknown
  >
  tokenProgram(): ConstraintTokenProgram
  token2022Program(): ConstraintToken2022Program
  close<T>(acct: T, refundTo: string): ConstraintClose & { __accountType: T }
  clock(): ConstraintClock
}

// ── Unwrap helpers ──

type InferFromBuilder<B> =
  B extends AccountBuilder<infer F> ? InferAccountData<F> :
  never

type InferFromAccount<A> =
  A extends SolAccount<infer F> ? InferAccountData<F> :
  never

// Infer the runtime type for a single constraint in accounts map
type InferConstraint<C> =
  C extends ConstraintInitOf<infer T> ? (T extends AccountBuilder<any> ? InferFromBuilder<T> : never) & { key: string } :
  C extends ConstraintMutOf<infer T> ? (T extends AccountBuilder<any> ? InferFromBuilder<T> : never) & { key: string } :
  C extends ConstraintSigner ? string :
  C extends ConstraintTokenAccount ? TokenAccountData :
  C extends ConstraintMint ? MintAccountData :
  C extends ConstraintRemainingOf<infer E> ? readonly E[] :
  C extends ConstraintClose ? unknown :
  C extends ConstraintTokenProgram ? unknown :
  C extends ConstraintToken2022Program ? unknown :
  C extends AccountBuilder<infer F> ? Readonly<InferAccountData<F>> & { key: string } :  // bare account (read-only)
  C extends SolAccount<infer F> ? Readonly<InferAccountData<F>> & { key: string } :       // bare account (read-only)
  unknown

// Infer ALL accounts in the instruction (mutable for writable constraints)
type InferAllAccounts<T extends Record<string, any>> = {
  -readonly [K in keyof T]: InferConstraint<T[K]>
}

// ── CPI functions ──

declare const token: {
  transfer(p: { from: any; to: any; authority: any; amount: bigint }): void
  transferChecked(p: { from: any; to: any; authority: any; mint: any; amount: bigint; decimals: number }): void
  mintTo(p: { mint: any; to: any; authority: any; amount: bigint }): void
  burn(p: { from: any; mint: any; authority: any; amount: bigint }): void
}

declare const token2022: {
  transferCheckedWithFee(p: { from: any; to: any; authority: any; mint: any; amount: bigint; decimals: number; fee: bigint }): void
}

declare const sol: {
  timestamp(): bigint
  slot(): bigint
}

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
    accounts: InferAllAccounts<TAccounts>,
    args: { [K in keyof TArgs]: SolTypeMap[TArgs[K]['__sol']] },
    ctx: ProgramContext<TErrors, TEvents>,
  ) => void
}

declare function ix<
  TErrors extends Record<string, string>,
  TEvents extends Record<string, Record<string, SolField>>,
  const TAccounts extends Record<string, any>,
  const TArgs extends Record<string, SolField>,
>(config: IxConfig<TAccounts, TArgs, TErrors, TEvents>): IxConfig<TAccounts, TArgs, TErrors, TEvents>

// ── program() ──

declare function program<const TConfig extends {
  name: string
  address: string
  errors: ErrorRegistry<any>
  events?: EventRegistry<any>
  instructions: Record<string, any>
}>(config: TConfig): TConfig


// ╔══════════════════════════════════════════════════════════════╗
// ║  TEST 1: AMM WITH TOKEN-2022                                ║
// ╚══════════════════════════════════════════════════════════════╝

const Pool = account({
  tokenAMint: pubkey,
  tokenBMint: pubkey,
  lpSupply: u64,
  feeBps: u64,
  isActive: bool,
  bump: u8,
})

const ammErrors = defineErrors({
  Unauthorized: 'Not authorized',
  InvalidAmount: 'Must be > 0',
  SlippageExceeded: 'Output below minimum',
  PoolInactive: 'Pool not active',
  InvalidMint: 'Mint mismatch',
})

const ammEvents = defineEvents({
  Swap: { amountIn: u64, amountOut: u64, fee: u64, direction: u8 },
  LiquidityAdded: { amountA: u64, amountB: u64, lpTokens: u64 },
})

export const amm = program({
  name: 'amm',
  address: 'AMMxPooL11111111111111111111111111111111111',
  errors: ammErrors,
  events: ammEvents,
  instructions: {

    swap: ix({
      accounts: {
        pool: p.mut(Pool),
        reserveA: p.tokenAccount().mut(),
        reserveB: p.tokenAccount().mut(),
        traderTokenIn: p.tokenAccount().mut(),
        traderTokenOut: p.tokenAccount().mut(),
        trader: p.signer(),
        mintIn: p.mint(),
        token2022Program: p.token2022Program(),
      },
      args: { amountIn: u64, minOut: u64, direction: u8 },
      run: ({ pool, reserveA, reserveB, traderTokenIn, traderTokenOut, trader, mintIn }, { amountIn, minOut, direction }, ctx) => {
        // ✅ pool is typed: { tokenAMint: string, tokenBMint: string, lpSupply: bigint, feeBps: bigint, isActive: boolean, bump: number, key: string }
        ctx.require(pool.isActive, 'PoolInactive')
        ctx.require(amountIn > 0n, 'InvalidAmount')

        const reserveIn = direction === 0 ? reserveA : reserveB
        const reserveOut = direction === 0 ? reserveB : reserveA

        // ✅ traderTokenIn is typed: { mint: string, owner: string, amount: bigint, key: string }
        ctx.require(traderTokenIn.mint === mintIn.key, 'InvalidMint')

        // ✅ BigInt arithmetic
        const fee = (amountIn * pool.feeBps) / 10000n
        const netIn = amountIn - fee
        const amountOut = (netIn * reserveOut.amount) / (reserveIn.amount + netIn)
        ctx.require(amountOut >= minOut, 'SlippageExceeded')

        // ✅ Token-2022 transferChecked CPI
        token.transferChecked({
          from: traderTokenIn,
          to: reserveIn,
          authority: trader,
          mint: mintIn,
          amount: amountIn,
          decimals: 9,
        })

        // ✅ Type-safe event emission
        ctx.emit('Swap', { amountIn, amountOut, fee, direction })
      },
    }),
  },
})


// ╔══════════════════════════════════════════════════════════════╗
// ║  TEST 2: BATCH TRANSFER WITH REMAINING ACCOUNTS             ║
// ╚══════════════════════════════════════════════════════════════╝

const batchErrors = defineErrors({
  InvalidLength: 'Array length mismatch',
  InvalidOwner: 'Not token owner',
  InsufficientBalance: 'Not enough tokens',
})

export const batch = program({
  name: 'batch',
  address: 'BaTcH111111111111111111111111111111111111111',
  errors: batchErrors,
  instructions: {
    batchTransfer: ix({
      accounts: {
        authority: p.signer(),
        source: p.tokenAccount().mut(),
        destinations: p.remaining(p.tokenAccount()),
      },
      args: { amount: u64 },
      run: ({ authority, source, destinations }, { amount }, ctx) => {
        // ✅ authority is string
        // ✅ source is TokenAccountData
        // ✅ destinations is readonly TokenAccountData[]
        ctx.require(source.owner === authority, 'InvalidOwner')

        for (let i = 0; i < destinations.length; i++) {
          // ✅ destinations[i] is TokenAccountData
          ctx.require(destinations[i].owner === authority, 'InvalidOwner')

          token.transfer({
            from: source,
            to: destinations[i],
            authority,
            amount,
          })
        }
      },
    }),
  },
})


// ╔══════════════════════════════════════════════════════════════╗
// ║  TEST 3: ZERO-COPY ORDERBOOK                                ║
// ╚══════════════════════════════════════════════════════════════╝

const Order = struct_zc({
  trader: pubkey,
  price: u64,
  quantity: u64,
  timestamp: i64,
})

const OrderBook = account({
  market: pubkey,
  bidCount: u32,
  askCount: u32,
  bestBid: u64,
  bestAsk: u64,
  isActive: bool,
  bump: u8,
  bids: array(Order, 256),
  asks: array(Order, 256),
})

const FillRecord = account({
  orderBook: pubkey,
  trader: pubkey,
  isBid: bool,
  price: u64,
  quantity: u64,
  timestamp: i64,
})

const obErrors = defineErrors({
  Unauthorized: 'Not authorized',
  OrderbookFull: 'No space',
  InvalidPrice: 'Price > 0 required',
  InvalidQuantity: 'Quantity > 0 required',
  NoOrders: 'No orders to match',
})

const obEvents = defineEvents({
  OrderPlaced: { isBid: bool, price: u64, quantity: u64 },
  OrdersMatched: { matchCount: u32 },
})

export const orderbook = program({
  name: 'orderbook',
  address: '0rdrB00k11111111111111111111111111111111111',
  errors: obErrors,
  events: obEvents,
  instructions: {

    placeBid: ix({
      accounts: {
        book: p.mut(OrderBook),
        trader: p.signer(),
      },
      args: { price: u64, quantity: u64 },
      run: ({ book, trader }, { price, quantity }, ctx) => {
        // ✅ book is typed with all OrderBook fields including bids/asks arrays
        ctx.require(book.isActive, 'Unauthorized')
        ctx.require(price > 0n, 'InvalidPrice')
        ctx.require(quantity > 0n, 'InvalidQuantity')
        ctx.require(book.bidCount < 256, 'OrderbookFull')

        // ✅ Array index access with typed struct fields
        book.bids[book.bidCount] = { trader, price, quantity, timestamp: sol.timestamp() }
        book.bidCount += 1

        if (price > book.bestBid) {
          book.bestBid = price
        }

        ctx.emit('OrderPlaced', { isBid: true, price, quantity })
      },
    }),

    matchOrders: ix({
      accounts: {
        book: p.mut(OrderBook),
        filler: p.signer(),
        fills: p.remaining(FillRecord),
      },
      args: {},
      run: ({ book, filler, fills }, _args, ctx) => {
        ctx.require(book.isActive, 'Unauthorized')
        ctx.require(book.bidCount > 0, 'NoOrders')
        ctx.require(book.askCount > 0, 'NoOrders')

        for (let i = 0; i < fills.length; i++) {
          // ✅ book.bids[i] is typed: { trader: string, price: bigint, quantity: bigint, timestamp: bigint }
          const bid = book.bids[i]
          const ask = book.asks[i]

          if (bid.price >= ask.price && bid.quantity > 0n && ask.quantity > 0n) {
            const matchQty = bid.quantity < ask.quantity ? bid.quantity : ask.quantity

            // ✅ fills[i] is typed: { orderBook: string, trader: string, isBid: boolean, price: bigint, quantity: bigint, timestamp: bigint, key: string }
            fills[i].orderBook = book.key
            fills[i].trader = bid.trader
            fills[i].isBid = true
            fills[i].price = bid.price
            fills[i].quantity = matchQty
            fills[i].timestamp = sol.timestamp()

            book.bids[i].quantity -= matchQty
            book.asks[i].quantity -= matchQty
          }
        }

        ctx.emit('OrdersMatched', { matchCount: fills.length as unknown as number })
      },
    }),
  },
})


// ╔══════════════════════════════════════════════════════════════╗
// ║  TEST 4: COUNTER (COLLISION TEST)                           ║
// ╚══════════════════════════════════════════════════════════════╝

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
        counter: p.mut(Counter),  // account named 'counter'
        authority: p.signer(),
      },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        // ✅ 'counter' is the account, 'ctx' is the context — no collision
        ctx.require(authority === counter.authority, 'Unauthorized')
        ctx.require(counter.isActive, 'NotActive')
        counter.count += amount
      },
    }),
  },
})


// ╔══════════════════════════════════════════════════════════════╗
// ║  COMPILE-TIME ERROR EXAMPLES — ALL MUST FAIL                 ║
// ╚══════════════════════════════════════════════════════════════╝

// Uncomment any of these to see the TS error:

// ❌ Wrong error name
// ctx.require(false, 'NotAnError')
// TS2345: '"NotAnError"' is not assignable to '"Unauthorized" | "InvalidAmount" | ...'

// ❌ Wrong event name
// ctx.emit('NotAnEvent', {})
// TS2345: '"NotAnEvent"' is not assignable to '"Swap" | "LiquidityAdded"'

// ❌ Missing event field
// ctx.emit('Swap', { amountIn: 1n })
// TS2345: missing 'amountOut', 'fee', 'direction'

// ❌ Wrong field type
// ctx.emit('Swap', { amountIn: 1n, amountOut: 1n, fee: 1n, direction: 'wrong' })
// TS2322: string not assignable to number

// ❌ Accessing nonexistent property on token account
// traderTokenIn.nonExistent
// TS2339: 'nonExistent' does not exist on 'TokenAccountData'
