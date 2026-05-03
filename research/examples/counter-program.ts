import {
  program, account,
  u64, bool, pubkey,
  p,
} from 'better-sol/program'

const Counter = account({
  count: u64,
  authority: pubkey,
  isActive: bool,
}).derive((seed) => ["counter", seed.authority])

export const counterProgram = program({
  name: 'counter',
  address: '91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs',
  errors: {
  Unauthorized: 'Only the creator can perform this action',
  NotActive: 'Counter is not active',
  BelowZero: 'Counter would go below zero',
},
  }, ix => ({

    initialize: ix({
      accounts: {
        counter: p.create(Counter),
        authority: p.signer(),
      },
      args: { initialValue: u64 },
      run: ({ counter, authority }, { initialValue }) => {
        counter.count = initialValue
        counter.authority = authority
        counter.isActive = true
      },
    }),

    increment: ix({
      accounts: {
        counter: p.mut(Counter),
        authority: p.signer(),
      },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, 'Unauthorized')
        ctx.require(counter.isActive, 'NotActive')
        counter.count += amount
      },
    }),

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

    close: ix({
      accounts: {
        counter: p.close(Counter, 'authority'),
        authority: p.signer(),
      },
      run: () => {},
    }),
}))
