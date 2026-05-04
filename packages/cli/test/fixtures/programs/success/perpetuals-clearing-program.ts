import { bs, cpi } from "better-sol/program";

const RestingOrder = bs.struct({
  trader: bs.pubkey(),
  orderId: bs.u64(),
  price: bs.u64(),
  quantity: bs.u64(),
  filled: bs.u64(),
  side: bs.u8(),
  flags: bs.u8(),
  timestamp: bs.i64(),
});

const PerpMarket = bs.account({
  authority: bs.pubkey(),
  baseMint: bs.pubkey(),
  quoteMint: bs.pubkey(),
  collateralVault: bs.pubkey(),
  feeVault: bs.pubkey(),
  openInterestLong: bs.u64(),
  openInterestShort: bs.u64(),
  fundingIndexLong: bs.i64(),
  fundingIndexShort: bs.i64(),
  markPrice: bs.u64(),
  oraclePrice: bs.u64(),
  nextOrderId: bs.u64(),
  bidCount: bs.u32(),
  askCount: bs.u32(),
  feeBps: bs.u64(),
  paused: bs.u8(),
  bump: bs.u8(),
  bids: bs.array(RestingOrder, 64),
  asks: bs.array(RestingOrder, 64),
})
  .derive((seed) => ["perp_market", seed.baseMint, seed.quoteMint])
  .zeroCopy();

const VaultAuthority = bs.account({
  market: bs.pubkey(),
  baseMint: bs.pubkey(),
  quoteMint: bs.pubkey(),
  bump: bs.u8(),
}).derive((seed) => ["perp_vault", seed.market]);

const TraderPosition = bs.account({
  owner: bs.pubkey(),
  market: bs.pubkey(),
  collateral: bs.u64(),
  basePosition: bs.i64(),
  quotePosition: bs.i64(),
  entryPrice: bs.u64(),
  realizedPnl: bs.i64(),
  fundingCheckpointLong: bs.i64(),
  fundingCheckpointShort: bs.i64(),
  liquidationPrice: bs.u64(),
  openOrders: bs.u64(),
  bump: bs.u8(),
}).derive((seed) => ["position", seed.owner, seed.market]);

const TradeRecord = bs.account({
  market: bs.pubkey(),
  maker: bs.pubkey(),
  taker: bs.pubkey(),
  price: bs.u64(),
  quantity: bs.u64(),
  side: bs.u8(),
  timestamp: bs.i64(),
}).derive((seed) => ["trade_record", seed.market, seed.taker]);

const FundingCheckpoint = bs.account({
  market: bs.pubkey(),
  timestamp: bs.i64(),
  fundingIndexLong: bs.i64(),
  fundingIndexShort: bs.i64(),
  markPrice: bs.u64(),
  oraclePrice: bs.u64(),
}).derive((seed) => ["funding", seed.market]);

;

const events = {
  MarketInitialized: {
    market: bs.pubkey(),
    authority: bs.pubkey(),
    baseMint: bs.pubkey(),
    quoteMint: bs.pubkey(),
  },
  CollateralDeposited: {
    owner: bs.pubkey(),
    market: bs.pubkey(),
    amount: bs.u64(),
    totalCollateral: bs.u64(),
  },
  CollateralWithdrawn: {
    owner: bs.pubkey(),
    market: bs.pubkey(),
    amount: bs.u64(),
    remainingCollateral: bs.u64(),
  },
  OrderPlaced: {
    trader: bs.pubkey(),
    market: bs.pubkey(),
    orderId: bs.u64(),
    side: bs.u8(),
    price: bs.u64(),
    quantity: bs.u64(),
  },
  OrderCancelled: {
    trader: bs.pubkey(),
    market: bs.pubkey(),
    orderId: bs.u64(),
    side: bs.u8(),
    remainingQuantity: bs.u64(),
  },
  OrdersMatched: { market: bs.pubkey(), matches: bs.u64(), quantity: bs.u64(), price: bs.u64() },
  FundingUpdated: {
    market: bs.pubkey(),
    fundingIndexLong: bs.i64(),
    fundingIndexShort: bs.i64(),
    markPrice: bs.u64(),
    oraclePrice: bs.u64(),
  },
  Liquidated: {
    liquidator: bs.pubkey(),
    owner: bs.pubkey(),
    market: bs.pubkey(),
    penalty: bs.u64(),
    remainingCollateral: bs.u64(),
  },
};

export const perpetualsClearing = bs.program({
  name: "perpetuals_clearing",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: {
    Unauthorized: "Not authorized",
    InvalidAmount: "Amount must be greater than zero",
    InvalidPrice: "Price must be greater than zero",
    InvalidSide: "Invalid side",
    InvalidVault: "Invalid vault",
    MarketPaused: "Market is paused",
    InsufficientCollateral: "Insufficient collateral",
    OrderBookFull: "Order book full",
    OrderNotFound: "Order not found",
    NoCross: "No crossing orders",
    PositionHealthy: "Position is healthy",
  },
  events,
}, ix => ({
    initializeMarket: ix({
      accounts: {
        market: bs.init(PerpMarket),
        vaultAuthority: bs.init(VaultAuthority),
        collateralVault: bs.tokenAccount().writable(),
        feeVault: bs.tokenAccount().writable(),
        baseMint: bs.mint(),
        quoteMint: bs.mint(),
        authority: bs.signer(),
      },
      args: {
        markPrice: bs.u64(),
        oraclePrice: bs.u64(),
        feeBps: bs.u64(),
      },
      run: (
        {
          market,
          vaultAuthority,
          collateralVault,
          feeVault,
          baseMint,
          quoteMint,
          authority,
        },
        { markPrice, oraclePrice, feeBps },
        ctx,
      ) => {
        ctx.require(markPrice > 0n, "InvalidPrice");
        ctx.require(oraclePrice > 0n, "InvalidPrice");
        ctx.require(collateralVault.mint === quoteMint.key, "InvalidVault");
        ctx.require(feeVault.mint === quoteMint.key, "InvalidVault");
        market.authority = authority;
        market.baseMint = baseMint.key;
        market.quoteMint = quoteMint.key;
        market.collateralVault = collateralVault.key;
        market.feeVault = feeVault.key;
        market.openInterestLong = 0n;
        market.openInterestShort = 0n;
        market.fundingIndexLong = 0n;
        market.fundingIndexShort = 0n;
        market.markPrice = markPrice;
        market.oraclePrice = oraclePrice;
        market.nextOrderId = 1n;
        market.bidCount = 0;
        market.askCount = 0;
        market.feeBps = feeBps;
        market.paused = 0;
        market.bump = 0;
        vaultAuthority.market = market.key;
        vaultAuthority.baseMint = baseMint.key;
        vaultAuthority.quoteMint = quoteMint.key;
        vaultAuthority.bump = 0;
        ctx.emit("MarketInitialized", {
          market: market.key,
          authority,
          baseMint: baseMint.key,
          quoteMint: quoteMint.key,
        });
      },
    }),

    openPosition: ix({
      accounts: {
        market: bs.mut(PerpMarket),
        position: bs.init(TraderPosition),
        userCollateral: bs.tokenAccount().writable(),
        collateralVault: bs.tokenAccount().writable(),
        owner: bs.signer(),
        tokenProgram: bs.tokenProgram(),
      },
      args: { collateral: bs.u64() },
      run: (
        { market, position, userCollateral, collateralVault, owner },
        { collateral },
        ctx,
      ) => {
        ctx.require(market.paused === 0, "MarketPaused");
        ctx.require(collateral > 0n, "InvalidAmount");
        ctx.require(
          collateralVault.key === market.collateralVault,
          "InvalidVault",
        );
        ctx.require(userCollateral.mint === market.quoteMint, "InvalidVault");
        cpi.token.transfer({
          from: userCollateral,
          to: collateralVault,
          authority: owner,
          amount: collateral,
        });
        position.owner = owner;
        position.market = market.key;
        position.collateral = collateral;
        position.basePosition = 0n;
        position.quotePosition = 0n;
        position.entryPrice = market.markPrice;
        position.realizedPnl = 0n;
        position.fundingCheckpointLong = market.fundingIndexLong;
        position.fundingCheckpointShort = market.fundingIndexShort;
        position.liquidationPrice = 0n;
        position.openOrders = 0n;
        position.bump = 0;
        ctx.emit("CollateralDeposited", {
          owner,
          market: market.key,
          amount: collateral,
          totalCollateral: position.collateral,
        });
      },
    }),

    depositCollateral: ix({
      accounts: {
        market: bs.mut(PerpMarket),
        position: bs.mut(TraderPosition),
        userCollateral: bs.tokenAccount().writable(),
        collateralVault: bs.tokenAccount().writable(),
        owner: bs.signer(),
        tokenProgram: bs.tokenProgram(),
      },
      args: { amount: bs.u64() },
      run: (
        { market, position, userCollateral, collateralVault, owner },
        { amount },
        ctx,
      ) => {
        ctx.require(owner === position.owner, "Unauthorized");
        ctx.require(amount > 0n, "InvalidAmount");
        ctx.require(
          collateralVault.key === market.collateralVault,
          "InvalidVault",
        );
        ctx.require(userCollateral.mint === market.quoteMint, "InvalidVault");
        cpi.token.transfer({
          from: userCollateral,
          to: collateralVault,
          authority: owner,
          amount,
        });
        position.collateral += amount;
        ctx.emit("CollateralDeposited", {
          owner,
          market: market.key,
          amount,
          totalCollateral: position.collateral,
        });
      },
    }),

    withdrawCollateral: ix({
      accounts: {
        market: bs.mut(PerpMarket),
        position: bs.mut(TraderPosition),
        vaultAuthority: bs.mut(VaultAuthority),
        userCollateral: bs.tokenAccount().writable(),
        collateralVault: bs.tokenAccount().writable(),
        owner: bs.signer(),
        tokenProgram: bs.tokenProgram(),
      },
      args: { amount: bs.u64() },
      run: (
        {
          market,
          position,
          vaultAuthority,
          userCollateral,
          collateralVault,
          owner,
        },
        { amount },
        ctx,
      ) => {
        ctx.require(owner === position.owner, "Unauthorized");
        ctx.require(amount > 0n, "InvalidAmount");
        ctx.require(position.collateral >= amount, "InsufficientCollateral");
        ctx.require(
          collateralVault.key === market.collateralVault,
          "InvalidVault",
        );
        ctx.require(vaultAuthority.market === market.key, "InvalidVault");
        ctx.require(userCollateral.mint === market.quoteMint, "InvalidVault");
        cpi.token.transfer({
          from: collateralVault,
          to: userCollateral,
          authority: vaultAuthority,
          amount,
        });
        position.collateral -= amount;
        ctx.emit("CollateralWithdrawn", {
          owner,
          market: market.key,
          amount,
          remainingCollateral: position.collateral,
        });
      },
    }),

    placeLimitOrder: ix({
      accounts: {
        market: bs.mut(PerpMarket),
        position: bs.mut(TraderPosition),
        trader: bs.signer(),
      },
      args: {
        side: bs.u8(),
        price: bs.u64(),
        quantity: bs.u64(),
        reduceOnly: bs.bool(),
      },
      run: (
        { market, position, trader },
        { side, price, quantity, reduceOnly },
        ctx,
      ) => {
        ctx.require(market.paused === 0, "MarketPaused");
        ctx.require(trader === position.owner, "Unauthorized");
        ctx.require(side <= 1, "InvalidSide");
        ctx.require(price > 0n, "InvalidPrice");
        ctx.require(quantity > 0n, "InvalidAmount");
        let flags = 0;
        if (reduceOnly) {
          flags = 1;
        } else {
          flags = 0;
        }
        const orderId = market.nextOrderId;
        if (side === 0) {
          ctx.require(market.bidCount < 64, "OrderBookFull");
          market.bids[market.bidCount] = {
            trader,
            orderId,
            price,
            quantity,
            filled: 0n,
            side,
            flags,
            timestamp: cpi.sol.timestamp(),
          };
          market.bidCount += 1;
          market.openInterestLong += quantity;
        } else {
          ctx.require(market.askCount < 64, "OrderBookFull");
          market.asks[market.askCount] = {
            trader,
            orderId,
            price,
            quantity,
            filled: 0n,
            side,
            flags,
            timestamp: cpi.sol.timestamp(),
          };
          market.askCount += 1;
          market.openInterestShort += quantity;
        }
        market.nextOrderId += 1n;
        position.openOrders += 1n;
        ctx.emit("OrderPlaced", {
          trader,
          market: market.key,
          orderId,
          side,
          price,
          quantity,
        });
      },
    }),

    cancelOrder: ix({
      accounts: {
        market: bs.mut(PerpMarket),
        position: bs.mut(TraderPosition),
        trader: bs.signer(),
      },
      args: {
        side: bs.u8(),
        orderId: bs.u64(),
      },
      run: ({ market, position, trader }, { side, orderId }, ctx) => {
        ctx.require(trader === position.owner, "Unauthorized");
        ctx.require(side <= 1, "InvalidSide");
        let found = 0;
        let remaining = 0n;
        if (side === 0) {
          for (let i = 0; i < market.bidCount; i++) {
            if (market.bids[i]!.orderId === orderId) {
              remaining = market.bids[i]!.quantity - market.bids[i]!.filled;
              market.bids[i]!.quantity = market.bids[i]!.filled;
              found = 1;
            }
          }
          market.openInterestLong -= remaining;
        } else {
          for (let i = 0; i < market.askCount; i++) {
            if (market.asks[i]!.orderId === orderId) {
              remaining = market.asks[i]!.quantity - market.asks[i]!.filled;
              market.asks[i]!.quantity = market.asks[i]!.filled;
              found = 1;
            }
          }
          market.openInterestShort -= remaining;
        }
        ctx.require(found === 1, "OrderNotFound");
        if (position.openOrders > 0n) {
          position.openOrders -= 1n;
        }
        ctx.emit("OrderCancelled", {
          trader,
          market: market.key,
          orderId,
          side,
          remainingQuantity: remaining,
        });
      },
    }),

    matchOrders: ix({
      accounts: {
        market: bs.mut(PerpMarket),
        fills: bs.remaining(TradeRecord),
        authority: bs.signer(),
      },
      args: { maxMatches: bs.u64() },
      run: ({ market, fills, authority }, { maxMatches }, ctx) => {
        ctx.require(authority === market.authority, "Unauthorized");
        ctx.require(market.paused === 0, "MarketPaused");
        ctx.require(market.bidCount > 0, "NoCross");
        ctx.require(market.askCount > 0, "NoCross");
        let matches = 0n;
        let totalQuantity = 0n;
        let lastPrice = 0n;
        const limit = fills.length < maxMatches ? fills.length : maxMatches;
        for (let i = 0; i < limit; i++) {
          const bid = market.bids[i]!;
          const ask = market.asks[i]!;
          if (bid.quantity === bid.filled || ask.quantity === ask.filled) {
            continue;
          }
          if (bid.price < ask.price) {
            continue;
          }
          const bidRemaining = bid.quantity - bid.filled;
          const askRemaining = ask.quantity - ask.filled;
          const matchQuantity =
            bidRemaining < askRemaining ? bidRemaining : askRemaining;
          const matchPrice = ask.price;
          market.bids[i]!.filled += matchQuantity;
          market.asks[i]!.filled += matchQuantity;
          fills[i]!.market = market.key;
          fills[i]!.maker = ask.trader;
          fills[i]!.taker = bid.trader;
          fills[i]!.price = matchPrice;
          fills[i]!.quantity = matchQuantity;
          fills[i]!.side = 0;
          fills[i]!.timestamp = cpi.sol.timestamp();
          matches += 1n;
          totalQuantity += matchQuantity;
          lastPrice = matchPrice;
        }
        ctx.require(matches > 0n, "NoCross");
        market.markPrice = lastPrice;
        ctx.emit("OrdersMatched", {
          market: market.key,
          matches,
          quantity: totalQuantity,
          price: lastPrice,
        });
      },
    }),

    updateFunding: ix({
      accounts: {
        market: bs.mut(PerpMarket),
        checkpoint: bs.init(FundingCheckpoint),
        authority: bs.signer(),
      },
      args: {
        oraclePrice: bs.u64(),
      },
      run: ({ market, checkpoint, authority }, { oraclePrice }, ctx) => {
        ctx.require(authority === market.authority, "Unauthorized");
        ctx.require(oraclePrice > 0n, "InvalidPrice");
        market.oraclePrice = oraclePrice;
        if (market.markPrice > oraclePrice) {
          const premium = market.markPrice - oraclePrice;
          const impact = premium / 100n;
          market.fundingIndexLong += impact;
          market.fundingIndexShort -= impact;
        } else {
          const discount = oraclePrice - market.markPrice;
          const impact = discount / 100n;
          market.fundingIndexLong -= impact;
          market.fundingIndexShort += impact;
        }
        checkpoint.market = market.key;
        checkpoint.timestamp = cpi.sol.timestamp();
        checkpoint.fundingIndexLong = market.fundingIndexLong;
        checkpoint.fundingIndexShort = market.fundingIndexShort;
        checkpoint.markPrice = market.markPrice;
        checkpoint.oraclePrice = market.oraclePrice;
        ctx.emit("FundingUpdated", {
          market: market.key,
          fundingIndexLong: market.fundingIndexLong,
          fundingIndexShort: market.fundingIndexShort,
          markPrice: market.markPrice,
          oraclePrice: market.oraclePrice,
        });
      },
    }),

    liquidatePosition: ix({
      accounts: {
        market: bs.mut(PerpMarket),
        position: bs.mut(TraderPosition),
        vaultAuthority: bs.mut(VaultAuthority),
        liquidatorCollateral: bs.tokenAccount().writable(),
        collateralVault: bs.tokenAccount().writable(),
        liquidator: bs.signer(),
        tokenProgram: bs.tokenProgram(),
      },
      args: { penalty: bs.u64() },
      run: (
        {
          market,
          position,
          vaultAuthority,
          liquidatorCollateral,
          collateralVault,
          liquidator,
        },
        { penalty },
        ctx,
      ) => {
        ctx.require(penalty > 0n, "InvalidAmount");
        ctx.require(position.collateral <= penalty, "PositionHealthy");
        ctx.require(
          collateralVault.key === market.collateralVault,
          "InvalidVault",
        );
        ctx.require(vaultAuthority.market === market.key, "InvalidVault");
        ctx.require(
          liquidatorCollateral.mint === market.quoteMint,
          "InvalidVault",
        );
        const payout =
          penalty > position.collateral ? position.collateral : penalty;
        cpi.token.transfer({
          from: collateralVault,
          to: liquidatorCollateral,
          authority: vaultAuthority,
          amount: payout,
        });
        position.collateral -= payout;
        position.basePosition = 0n;
        position.quotePosition = 0n;
        position.openOrders = 0n;
        ctx.emit("Liquidated", {
          liquidator,
          owner: position.owner,
          market: market.key,
          penalty: payout,
          remainingCollateral: position.collateral,
        });
      },
    }),
}));

