// ============================================================
// Orderbook — Zero-Copy Account with Remaining Accounts
//
// Demonstrates:
// - account().zeroCopy() → #[account(zero_copy)] in Rust
// - struct() → #[zero_copy] sub-struct
// - array(T, N) → [T; N] fixed-size array
// - p.remaining() → ctx.remaining_accounts with typed deserialization
// - bool in zero-copy (maps to u8 in Rust)
// - Array index assignment (transpiler generates scoped borrows)
//
// This is the hardest pattern we support. If this works,
// everything simpler definitely works.
// ============================================================

import {
  program, account, struct,
  u64, u32, i64, u8, bool, pubkey, array,
  p, sol,
} from 'better-sol/program'

// ══════════════════════════════════════════
// ZERO-COPY SUB-STRUCTS
// ══════════════════════════════════════════
// These are Pod types in Rust — no Borsh, no heap allocation.
// All fields must be fixed-size (no String, no Vec).

const Order = struct({
  trader: pubkey,      // 32 bytes — stored as [u8; 32], auto-converted
  price: u64,          // 8 bytes
  quantity: u64,       // 8 bytes
  side: u8,            // 1 byte (0 = bid, 1 = ask)
  timestamp: i64,      // 8 bytes
  // Total: 57 bytes + 7 padding = 64 bytes (u64 alignment)
})

const MarketInfo = struct({
  baseDecimals: u8,    // 1 byte
  quoteDecimals: u8,   // 1 byte
  minOrderSize: u64,   // 8 bytes (+ 6 padding for alignment)
  tickSize: u64,       // 8 bytes
  // Total: 24 bytes
})

// ══════════════════════════════════════════
// ACCOUNTS
// ══════════════════════════════════════════

const OrderBook = account({
  market: pubkey,               // The market this book belongs to
  baseMint: pubkey,
  quoteMint: pubkey,
  marketInfo: MarketInfo,       // Embedded zero-copy struct
  bidCount: u32,
  askCount: u32,
  bestBid: u64,
  bestAsk: u64,
  totalBidVolume: u64,
  totalAskVolume: u64,
  isActive: bool,               // → u8 in zero-copy Rust (Pod constraint)
  bump: u8,
  bids: array(Order, 256),      // Fixed-size array of Orders
  asks: array(Order, 256),      // Fixed-size array of Orders
}).derive((seed) => ["orderbook", seed.market]).zeroCopy()
//                                     ^^^^^^^^^ zero-copy mode

// Standard (Borsh) account for fill records
const FillRecord = account({
  orderBook: pubkey,
  trader: pubkey,
  isBid: bool,
  price: u64,
  quantity: u64,
  timestamp: i64,
}).derive((seed) => ["fill", seed.orderBook, seed.trader, seed.timestamp])

const TradeHistory = account({
  orderBook: pubkey,
  tradeCount: u64,
  totalVolume: u64,
  highPrice: u64,
  lowPrice: u64,
  lastPrice: u64,
}).derive((seed) => ["history", seed.orderBook])

// ══════════════════════════════════════════
// ERRORS & EVENTS
// ══════════════════════════════════════════

// ══════════════════════════════════════════
// PROGRAM
// ══════════════════════════════════════════

export const orderbook = program({
  name: 'orderbook',
  address: 'AyX4nb665MQwz1riwohTAFvXLCuCqDnBD8PZaWHBHurg',
  errors: {
  Unauthorized: 'Not authorized to perform this action',
  OrderbookInactive: 'Orderbook is not active',
  OrderbookFull: 'No space for more orders on this side',
  InvalidPrice: 'Price must be greater than zero',
  InvalidQuantity: 'Quantity must be greater than zero',
  InvalidSide: 'Side must be 0 (bid) or 1 (ask)',
  NoOrders: 'No orders to match',
  SelfTrade: 'Cannot match own orders',
  PriceBelowMin: 'Price below minimum order size',
  NoMatchFound: 'No matching orders found',
},
  events: {
  OrderPlaced: {
    trader: pubkey,
    side: u8,
    price: u64,
    quantity: u64,
    orderIndex: u32,
  },
  OrdersMatched: {
    matchCount: u32,
    totalQuantity: u64,
  },
  OrderbookClosed: {
    market: pubkey,
  },
  PriceUpdated: {
    bestBid: u64,
    bestAsk: u64,
  },
},
  }, ix => ({

    // ── 1. Initialize orderbook ──
    initialize: ix({
      accounts: {
        book: p.create(OrderBook),
        admin: p.signer(),
      },
      args: { baseMint: pubkey, quoteMint: pubkey, baseDecimals: u8, quoteDecimals: u8, minOrderSize: u64, tickSize: u64 },
      run: ({ book, admin }, { baseMint, quoteMint, baseDecimals, quoteDecimals, minOrderSize, tickSize }) => {
        book.market = admin               // market = admin's pubkey (simplified)
        book.baseMint = baseMint
        book.quoteMint = quoteMint
        book.marketInfo = { baseDecimals, quoteDecimals, minOrderSize, tickSize }
        book.bidCount = 0
        book.askCount = 0
        book.bestBid = 0n
        book.bestAsk = 0n
        book.totalBidVolume = 0n
        book.totalAskVolume = 0n
        book.isActive = true    // → 1u8 in zero-copy Rust
      },
    }),

    // ── 2. Place a bid order ──
    placeBid: ix({
      accounts: {
        book: p.mut(OrderBook),
        trader: p.signer(),
      },
      args: { price: u64, quantity: u64 },
      run: ({ book, trader }, { price, quantity }, ctx) => {
        ctx.require(book.isActive, 'OrderbookInactive')
        ctx.require(price > 0n, 'InvalidPrice')
        ctx.require(price >= book.marketInfo.minOrderSize, 'PriceBelowMin')
        ctx.require(quantity > 0n, 'InvalidQuantity')
        ctx.require(book.bidCount < 256, 'OrderbookFull')

        // Insert bid at next available slot
        book.bids[book.bidCount] = {
          trader,
          price,
          quantity,
          side: 0,
          timestamp: sol.timestamp(),
        }

        book.bidCount += 1
        book.totalBidVolume += quantity

        // Update best bid
        if (price > book.bestBid) {
          book.bestBid = price
          ctx.emit('PriceUpdated', { bestBid: price, bestAsk: book.bestAsk })
        }

        ctx.emit('OrderPlaced', { trader, side: 0, price, quantity, orderIndex: book.bidCount - 1 })
      },
    }),

    // ── 3. Place an ask order ──
    placeAsk: ix({
      accounts: {
        book: p.mut(OrderBook),
        trader: p.signer(),
      },
      args: { price: u64, quantity: u64 },
      run: ({ book, trader }, { price, quantity }, ctx) => {
        ctx.require(book.isActive, 'OrderbookInactive')
        ctx.require(price > 0n, 'InvalidPrice')
        ctx.require(quantity > 0n, 'InvalidQuantity')
        ctx.require(book.askCount < 256, 'OrderbookFull')

        book.asks[book.askCount] = {
          trader,
          price,
          quantity,
          side: 1,
          timestamp: sol.timestamp(),
        }

        book.askCount += 1
        book.totalAskVolume += quantity

        // Update best ask
        if (book.bestAsk === 0n || price < book.bestAsk) {
          book.bestAsk = price
          ctx.emit('PriceUpdated', { bestBid: book.bestBid, bestAsk: price })
        }

        ctx.emit('OrderPlaced', { trader, side: 1, price, quantity, orderIndex: book.askCount - 1 })
      },
    }),

    // ── 4. Match orders — uses remaining accounts for fill records ──
    matchOrders: ix({
      accounts: {
        book: p.mut(OrderBook),
        baseReserve: p.tokenAccount().mut(),
        quoteReserve: p.tokenAccount().mut(),
        matchingEngine: p.signer(),
        fills: p.remaining(FillRecord),     // ← dynamic fill records
        history: p.mut(TradeHistory),
      },
      args: { maxMatches: u32 },
      run: ({ book, baseReserve, quoteReserve, fills, history }, { maxMatches }, ctx) => {
        ctx.require(book.isActive, 'OrderbookInactive')
        ctx.require(book.bidCount > 0, 'NoOrders')
        ctx.require(book.askCount > 0, 'NoOrders')

        let matchCount = 0
        let totalQuantity = 0n
        const limit = fills.length < maxMatches ? fills.length : maxMatches

        // Validate reserves belong to pool
        ctx.require(baseReserve.owner === book.key, 'Unauthorized')
        ctx.require(quoteReserve.owner === book.key, 'Unauthorized')

        // Simple matching: best bid vs best ask
        for (let i = 0; i < limit; i++) {
          const bid = book.bids[i]
          const ask = book.asks[i]

          // Skip filled orders
          if (bid.quantity === 0n || ask.quantity === 0n) {
            continue
          }

          // Skip self-trades
          if (bid.trader === ask.trader) {
            continue
          }

          // Can only match if bid price >= ask price
          if (bid.price >= ask.price) {
            const matchQty = bid.quantity < ask.quantity ? bid.quantity : ask.quantity
            const matchPrice = bid.price  // price improvement goes to maker (ask)

            // ── Write fill record (remaining account) ──
            fills[i].orderBook = book.key
            fills[i].trader = bid.trader
            fills[i].isBid = true
            fills[i].price = matchPrice
            fills[i].quantity = matchQty
            fills[i].timestamp = sol.timestamp()

            // ── Update zero-copy array ──
            // The transpiler scopes borrows around CPI calls
            book.bids[i].quantity -= matchQty
            book.asks[i].quantity -= matchQty

            // Track totals
            matchCount += 1
            totalQuantity += matchQty
          }
        }

        ctx.require(matchCount > 0, 'NoMatchFound')

        // Update trade history
        history.tradeCount += matchCount
        history.totalVolume += totalQuantity
        history.lastPrice = book.bestBid

        ctx.emit('OrdersMatched', { matchCount: matchCount as unknown as number, totalQuantity })
        ctx.log('Matched {} orders, total qty: {}', matchCount, totalQuantity)
      },
    }),

    // ── 5. Cancel order ──
    cancelOrder: ix({
      accounts: {
        book: p.mut(OrderBook),
        trader: p.signer(),
      },
      args: { orderIndex: u32, side: u8 },
      run: ({ book, trader }, { orderIndex, side }, ctx) => {
        ctx.require(book.isActive, 'OrderbookInactive')
        ctx.require(side === 0 || side === 1, 'InvalidSide')

        if (side === 0) {
          ctx.require(orderIndex < book.bidCount, 'InvalidPrice')
          const order = book.bids[orderIndex]
          ctx.require(order.trader === trader, 'Unauthorized')
          book.bids[orderIndex] = {
            trader: '',
            price: 0n,
            quantity: 0n,
            side: 0,
            timestamp: 0n,
          }
          book.totalBidVolume -= order.quantity
        } else {
          ctx.require(orderIndex < book.askCount, 'InvalidPrice')
          const order = book.asks[orderIndex]
          ctx.require(order.trader === trader, 'Unauthorized')
          book.asks[orderIndex] = {
            trader: '',
            price: 0n,
            quantity: 0n,
            side: 0,
            timestamp: 0n,
          }
          book.totalAskVolume -= order.quantity
        }
      },
    }),

    // ── 6. Close orderbook ──
    close: ix({
      accounts: {
        book: p.mut(OrderBook),
        admin: p.signer(),
      },
      run: ({ book, admin }, ctx) => {
        // Only market admin can close
        ctx.require(admin === book.market, 'Unauthorized')
        book.isActive = false  // → 0u8 in zero-copy Rust
        ctx.emit('OrderbookClosed', { market: book.market })
      },
    }),
}))
