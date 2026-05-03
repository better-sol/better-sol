import {
  account,
  array,
  bool,
  option,
  p,
  program,
  pubkey,
  string,
  struct,
  token,
  u8,
  u64,
  type InstructionAccounts,
  type InstructionArgs,
  type ProgramErrors,
  type ProgramEvents,
  type ProgramInstructions,
} from 'better-sol/program'

const Counter = account({
  count: u64,
  authority: pubkey,
  label: option(string),
  isActive: bool,
}).derive((seed) => ['counter', seed.authority])

const Order = struct({
  maker: pubkey,
  price: u64,
  quantity: u64,
  side: u8,
})

const Book = account({
  market: pubkey,
  orders: array(Order, 8),
  isActive: u8,
}).derive((seed) => ['book', seed.market]).zeroCopy()

export const counterProgram = program(
  {
    name: 'counter',
    address: '91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs',
    errors: {
      Unauthorized: 'Only the authority can update this account',
      Inactive: 'The counter is inactive',
    },
    events: {
      CounterUpdated: { count: u64, authority: pubkey },
      LabelChanged: { label: string },
    },
  },
  ix => ({
    initialize: ix({
      accounts: {
        counter: p.create(Counter),
        authority: p.signer(),
      },
      args: { initialValue: u64 },
      run: ({ counter, authority }, { initialValue }) => {
        counter.count = initialValue
        counter.authority = authority
        counter.label = null
        counter.isActive = true
      },
    }),

    rename: ix({
      accounts: {
        counter: p.mut(Counter),
        authority: p.signer(),
      },
      args: { label: string },
      run: ({ counter, authority }, { label }, ctx) => {
        ctx.require(authority === counter.authority, 'Unauthorized')
        ctx.require(counter.isActive, 'Inactive')
        counter.label = label
        ctx.emit('LabelChanged', { label })
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
        ctx.require(counter.isActive, 'Inactive')
        counter.count += amount
        ctx.emit('CounterUpdated', { count: counter.count, authority })
      },
    }),
  }),
)

export const orderbookProgram = program(
  {
    name: 'orderbook',
    address: 'A1cx7xZRTwuDknWvB6rRqjDDgX7nJPkqVTfNJf4e1o8',
    errors: {
      Closed: 'The book is closed',
      InvalidQuantity: 'Quantity must be greater than zero',
    },
  },
  ix => ({
    place: ix({
      accounts: {
        book: p.mut(Book),
        maker: p.signer(),
        makerToken: p.tokenAccount().mut(),
        vaultToken: p.tokenAccount().mut(),
        tokenProgram: p.tokenProgram(),
      },
      args: { price: u64, quantity: u64, side: u8 },
      run: ({ book, maker, makerToken, vaultToken }, { quantity }, ctx) => {
        ctx.require(book.isActive === 1, 'Closed')
        ctx.require(quantity > 0n, 'InvalidQuantity')
        token.transfer({
          from: makerToken,
          to: vaultToken,
          authority: maker,
          amount: quantity,
        })
      },
    }),
  }),
)

type CounterInstructions = ProgramInstructions<typeof counterProgram>
type IncrementAccounts = InstructionAccounts<CounterInstructions['increment']>
type IncrementArgs = InstructionArgs<CounterInstructions['increment']>
type CounterErrors = ProgramErrors<typeof counterProgram>
type CounterEvents = ProgramEvents<typeof counterProgram>

export type TypeSafetySample = {
  readonly accounts: IncrementAccounts
  readonly args: IncrementArgs
  readonly errors: CounterErrors
  readonly events: CounterEvents
}
