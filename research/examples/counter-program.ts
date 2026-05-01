// ============================================================
// Counter Program — The "Hello World" of Solana
//
// This is what a developer sees FIRST when they try our library.
// It should be dead simple, instantly understandable.
//
// Compare to Anchor (Rust):
//   - Anchor: ~80 lines across 3 files (lib.rs, mod.rs, Cargo.toml)
//   - Ours:   ~40 lines in ONE file
//
// And the same file is the typed client SDK. Zero extra code.
//
// Type safety (all compile-time, zero annotations):
// - ctx.require(cond, 'ErrorName') — autocomplete, checked
// - p.tokenAccount() — SPL token account (inferred mint/owner via ctx.require comparisons)
// - seeds('{field}') — validated against account fields at compile time
// ============================================================

import {
  program, account, ix, defineErrors,
  u64, bool, pubkey,
  p,
} from 'better-sol/program'

// ══════════════════════════════════════════
// ACCOUNT — Like a Zod schema
// ══════════════════════════════════════════

const Counter = account({
  count: u64,
  authority: pubkey,
  isActive: bool,
}).seeds('counter', '{authority}')
//                     ^^^^^^^^^^^^ compile-time checked: must be a pubkey field


// ══════════════════════════════════════════
// ERRORS — Typed registry for ctx.require()
// ══════════════════════════════════════════

const errors = defineErrors({
  Unauthorized: 'Only the creator can perform this action',
  NotActive: 'Counter is not active',
  BelowZero: 'Counter would go below zero',
})


// ══════════════════════════════════════════
// PROGRAM — Named params, ctx carries types
// ══════════════════════════════════════════

export const counter = program({
  name: 'counter',
  address: 'CouNTeR11111111111111111111111111111111111',
  errors,
  instructions: {

    // Create a new counter
    initialize: ix({
      accounts: {
        counter: p.init(Counter),
        authority: p.signer(),
      },
      args: { initialValue: u64 },
      run: ({ counter, authority }, { initialValue }) => {
        counter.count = initialValue
        counter.authority = authority
        counter.isActive = true
      },
    }),

    // Increment the counter
    increment: ix({
      accounts: {
        counter: p.mut(Counter),
        authority: p.signer(),
      },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        // The account 'counter' and the program 'counter' have the same name.
        // No collision — ctx is always the last parameter.
        ctx.require(authority === counter.authority, 'Unauthorized')
        ctx.require(counter.isActive, 'NotActive')
        counter.count += amount
      },
    }),

    // Decrement the counter
    decrement: ix({
      accounts: {
        counter: p.mut(Counter),
        authority: p.signer(),
      },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, 'Unauthorized')
        ctx.require(counter.isActive, 'NotActive')
        ctx.require(counter.count >= amount, 'BelowZero')
        counter.count -= amount
      },
    }),

    // Toggle the active status
    toggle: ix({
      accounts: {
        counter: p.mut(Counter),
        authority: p.signer(),
      },
      run: ({ counter, authority }, ctx) => {
        ctx.require(authority === counter.authority, 'Unauthorized')
        counter.isActive = !counter.isActive
      },
    }),

    // Close the counter and recover rent
    close: ix({
      accounts: {
        counter: p.close(Counter, 'authority'),
        authority: p.signer(),
      },
      run: () => {
        // Account is closed automatically by p.close()
      },
    }),
  },
})


// ══════════════════════════════════════════
// Client usage (same file, zero extra code)
// ══════════════════════════════════════════

import { betterSol } from 'better-sol'

const sol = betterSol({
  cluster: 'devnet',
  payer: './keypair.json',
  programs: { counter },
})

const payer = sol.payer

// Derive the counter PDA from seed definition
const counterAddr = counter.accounts.Counter.derive({ authority: payer })

// Create a counter starting at 42
await sol.counter.initialize({
  counter: counterAddr,
  authority: payer,
  initialValue: 42n,
})

// Increment by 10
await sol.counter.increment({
  counter: counterAddr,
  authority: payer,
  amount: 10n,
})

// Fetch the account (fully typed)
const data = await counter.accounts.Counter.fetch(counterAddr)
console.log(data.count)     // 52n
console.log(data.isActive)  // true

// Decrement by 2
await sol.counter.decrement({
  counter: counterAddr,
  authority: payer,
  amount: 2n,
})

// Close it
await sol.counter.close({
  counter: counterAddr,
  authority: payer,
})
