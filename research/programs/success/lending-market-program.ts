import {
  account,
  bool,
  i64,
  p,
  program,
  pubkey,
  sol,
  token,
  u8,
  u64,
} from "../../../packages/better-sol/src/program";

const MarketConfig = account({
  admin: pubkey,
  feeVault: pubkey,
  insuranceVault: pubkey,
  riskAuthority: pubkey,
  totalReserves: u64,
  paused: bool,
  bump: u8,
}).derive((seed) => ["lending_market", seed.admin]);

const Reserve = account({
  market: pubkey,
  assetMint: pubkey,
  collateralMint: pubkey,
  liquidityVault: pubkey,
  feeVault: pubkey,
  totalDeposits: u64,
  totalBorrows: u64,
  borrowIndex: u64,
  depositIndex: u64,
  utilizationBps: u64,
  borrowRateBps: u64,
  liquidationThresholdBps: u64,
  maxBorrowBps: u64,
  lastUpdated: i64,
  paused: bool,
  bump: u8,
}).derive((seed) => ["reserve", seed.market, seed.assetMint]);

const Obligation = account({
  owner: pubkey,
  reserve: pubkey,
  depositedAmount: u64,
  borrowedAmount: u64,
  collateralAmount: u64,
  lastAccrued: i64,
  healthBps: u64,
  flags: u8,
  bump: u8,
}).derive((seed) => ["obligation", seed.owner, seed.reserve]);

const LiquidationRecord = account({
  liquidator: pubkey,
  borrower: pubkey,
  reserve: pubkey,
  repaidAmount: u64,
  seizedCollateral: u64,
  timestamp: i64,
  closed: bool,
}).derive((seed) => ["liquidation", seed.borrower, seed.reserve]);

;

const events = {
  MarketInitialized: { admin: pubkey, riskAuthority: pubkey },
  ReserveCreated: { market: pubkey, reserve: pubkey, assetMint: pubkey },
  Deposited: {
    owner: pubkey,
    reserve: pubkey,
    amount: u64,
    collateralMinted: u64,
  },
  Borrowed: { owner: pubkey, reserve: pubkey, amount: u64, healthBps: u64 },
  Repaid: { owner: pubkey, reserve: pubkey, amount: u64, remainingDebt: u64 },
  Withdrawn: {
    owner: pubkey,
    reserve: pubkey,
    amount: u64,
    remainingDeposit: u64,
  },
  Liquidated: {
    liquidator: pubkey,
    borrower: pubkey,
    reserve: pubkey,
    repaidAmount: u64,
    seizedCollateral: u64,
  },
  InterestAccrued: {
    reserve: pubkey,
    totalBorrows: u64,
    utilizationBps: u64,
    timestamp: i64,
  },
  RiskUpdated: {
    reserve: pubkey,
    liquidationThresholdBps: u64,
    maxBorrowBps: u64,
    borrowRateBps: u64,
  },
  ObligationClosed: { owner: pubkey, reserve: pubkey },
}

export const lendingMarket = program({
  name: "lending_market",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: {
    Unauthorized: "Not authorized",
    InvalidAmount: "Amount must be greater than zero",
    InvalidMint: "Token mint does not match",
    MarketPaused: "Market is paused",
    ReservePaused: "Reserve is paused",
    InsufficientLiquidity: "Insufficient liquidity",
    BorrowLimitExceeded: "Borrow limit exceeded",
    ObligationNotEmpty: "Obligation not empty",
    InsufficientCollateral: "Insufficient collateral",
    HealthyObligation: "Obligation is not eligible for liquidation",
  },
  events,
}, ix => ({
    initializeMarket: ix({
      accounts: {
        market: p.create(MarketConfig),
        admin: p.signer(),
      },
      args: {
        feeVault: pubkey,
        insuranceVault: pubkey,
        riskAuthority: pubkey,
      },
      run: (
        { market, admin },
        { feeVault, insuranceVault, riskAuthority },
        ctx,
      ) => {
        market.admin = admin;
        market.feeVault = feeVault;
        market.insuranceVault = insuranceVault;
        market.riskAuthority = riskAuthority;
        market.totalReserves = 0n;
        market.paused = false;
        market.bump = 0;
        ctx.emit("MarketInitialized", { admin, riskAuthority });
      },
    }),

    createReserve: ix({
      accounts: {
        market: p.mut(MarketConfig),
        reserve: p.create(Reserve),
        assetMint: p.mint(),
        collateralMint: p.mint().mut(),
        liquidityVault: p.tokenAccount().mut(),
        feeVaultAccount: p.tokenAccount().mut(),
        admin: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: {
        liquidationThresholdBps: u64,
        maxBorrowBps: u64,
        borrowRateBps: u64,
      },
      run: (
        {
          market,
          reserve,
          assetMint,
          collateralMint,
          liquidityVault,
          feeVaultAccount,
          admin,
        },
        { liquidationThresholdBps, maxBorrowBps, borrowRateBps },
        ctx,
      ) => {
        ctx.require(admin === market.admin, "Unauthorized");
        ctx.require(!market.paused, "MarketPaused");
        ctx.require(liquidityVault.mint === assetMint.key, "InvalidMint");
        ctx.require(feeVaultAccount.mint === assetMint.key, "InvalidMint");
        reserve.market = market.key;
        reserve.assetMint = assetMint.key;
        reserve.collateralMint = collateralMint.key;
        reserve.liquidityVault = liquidityVault.key;
        reserve.feeVault = feeVaultAccount.key;
        reserve.totalDeposits = 0n;
        reserve.totalBorrows = 0n;
        reserve.borrowIndex = 1n;
        reserve.depositIndex = 1n;
        reserve.utilizationBps = 0n;
        reserve.borrowRateBps = borrowRateBps;
        reserve.liquidationThresholdBps = liquidationThresholdBps;
        reserve.maxBorrowBps = maxBorrowBps;
        reserve.lastUpdated = sol.timestamp();
        reserve.paused = false;
        reserve.bump = 0;
        market.totalReserves += 1n;
        ctx.emit("ReserveCreated", {
          market: market.key,
          reserve: reserve.key,
          assetMint: assetMint.key,
        });
      },
    }),

    deposit: ix({
      accounts: {
        reserve: p.mut(Reserve),
        obligation: p.create(Obligation),
        userLiquidity: p.tokenAccount().mut(),
        reserveLiquidity: p.tokenAccount().mut(),
        userCollateral: p.tokenAccount().mut(),
        collateralMint: p.mint().mut(),
        owner: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amount: u64 },
      run: (
        {
          reserve,
          obligation,
          userLiquidity,
          reserveLiquidity,
          userCollateral,
          collateralMint,
          owner,
        },
        { amount },
        ctx,
      ) => {
        ctx.require(amount > 0n, "InvalidAmount");
        ctx.require(!reserve.paused, "ReservePaused");
        ctx.require(userLiquidity.mint === reserve.assetMint, "InvalidMint");
        ctx.require(reserveLiquidity.mint === reserve.assetMint, "InvalidMint");
        ctx.require(
          userCollateral.mint === reserve.collateralMint,
          "InvalidMint",
        );
        ctx.require(
          collateralMint.key === reserve.collateralMint,
          "InvalidMint",
        );
        token.transfer({
          from: userLiquidity,
          to: reserveLiquidity,
          authority: owner,
          amount,
        });
        token.mintTo({
          mint: collateralMint,
          to: userCollateral,
          authority: reserve,
          amount,
        });
        obligation.owner = owner;
        obligation.reserve = reserve.key;
        obligation.depositedAmount = amount;
        obligation.borrowedAmount = 0n;
        obligation.collateralAmount = amount;
        obligation.lastAccrued = sol.timestamp();
        obligation.healthBps = 10000n;
        obligation.flags = 1;
        obligation.bump = 0;
        reserve.totalDeposits += amount;
        ctx.emit("Deposited", {
          owner,
          reserve: reserve.key,
          amount,
          collateralMinted: amount,
        });
      },
    }),

    borrow: ix({
      accounts: {
        reserve: p.mut(Reserve),
        obligation: p.mut(Obligation),
        reserveLiquidity: p.tokenAccount().mut(),
        borrowerLiquidity: p.tokenAccount().mut(),
        borrower: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amount: u64 },
      run: (
        { reserve, obligation, reserveLiquidity, borrowerLiquidity, borrower },
        { amount },
        ctx,
      ) => {
        ctx.require(amount > 0n, "InvalidAmount");
        ctx.require(!reserve.paused, "ReservePaused");
        ctx.require(borrower === obligation.owner, "Unauthorized");
        ctx.require(reserveLiquidity.amount >= amount, "InsufficientLiquidity");
        ctx.require(
          borrowerLiquidity.mint === reserve.assetMint,
          "InvalidMint",
        );
        const maxBorrow =
          (obligation.depositedAmount * reserve.maxBorrowBps) / 10000n;
        const nextBorrow = obligation.borrowedAmount + amount;
        ctx.require(nextBorrow <= maxBorrow, "BorrowLimitExceeded");
        token.transfer({
          from: reserveLiquidity,
          to: borrowerLiquidity,
          authority: reserve,
          amount,
        });
        obligation.borrowedAmount = nextBorrow;
        obligation.healthBps = ((maxBorrow - nextBorrow) * 10000n) / maxBorrow;
        reserve.totalBorrows += amount;
        reserve.utilizationBps =
          (reserve.totalBorrows * 10000n) / reserve.totalDeposits;
        ctx.emit("Borrowed", {
          owner: borrower,
          reserve: reserve.key,
          amount,
          healthBps: obligation.healthBps,
        });
      },
    }),

    repay: ix({
      accounts: {
        reserve: p.mut(Reserve),
        obligation: p.mut(Obligation),
        payerLiquidity: p.tokenAccount().mut(),
        reserveLiquidity: p.tokenAccount().mut(),
        payer: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amount: u64 },
      run: (
        { reserve, obligation, payerLiquidity, reserveLiquidity, payer },
        { amount },
        ctx,
      ) => {
        ctx.require(amount > 0n, "InvalidAmount");
        ctx.require(payer === obligation.owner, "Unauthorized");
        ctx.require(payerLiquidity.mint === reserve.assetMint, "InvalidMint");
        const repayAmount =
          amount > obligation.borrowedAmount
            ? obligation.borrowedAmount
            : amount;
        token.transfer({
          from: payerLiquidity,
          to: reserveLiquidity,
          authority: payer,
          amount: repayAmount,
        });
        obligation.borrowedAmount -= repayAmount;
        reserve.totalBorrows -= repayAmount;
        if (reserve.totalDeposits > 0n) {
          reserve.utilizationBps =
            (reserve.totalBorrows * 10000n) / reserve.totalDeposits;
        } else {
          reserve.utilizationBps = 0n;
        }
        ctx.emit("Repaid", {
          owner: payer,
          reserve: reserve.key,
          amount: repayAmount,
          remainingDebt: obligation.borrowedAmount,
        });
      },
    }),

    withdraw: ix({
      accounts: {
        reserve: p.mut(Reserve),
        obligation: p.mut(Obligation),
        reserveLiquidity: p.tokenAccount().mut(),
        userLiquidity: p.tokenAccount().mut(),
        userCollateral: p.tokenAccount().mut(),
        collateralMint: p.mint().mut(),
        owner: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amount: u64 },
      run: (
        {
          reserve,
          obligation,
          reserveLiquidity,
          userLiquidity,
          userCollateral,
          collateralMint,
          owner,
        },
        { amount },
        ctx,
      ) => {
        ctx.require(amount > 0n, "InvalidAmount");
        ctx.require(owner === obligation.owner, "Unauthorized");
        ctx.require(
          obligation.collateralAmount >= amount,
          "InsufficientCollateral",
        );
        ctx.require(reserveLiquidity.amount >= amount, "InsufficientLiquidity");
        ctx.require(userLiquidity.mint === reserve.assetMint, "InvalidMint");
        ctx.require(
          userCollateral.mint === reserve.collateralMint,
          "InvalidMint",
        );
        token.burn({
          from: userCollateral,
          mint: collateralMint,
          authority: owner,
          amount,
        });
        token.transfer({
          from: reserveLiquidity,
          to: userLiquidity,
          authority: reserve,
          amount,
        });
        obligation.collateralAmount -= amount;
        obligation.depositedAmount -= amount;
        reserve.totalDeposits -= amount;
        ctx.emit("Withdrawn", {
          owner,
          reserve: reserve.key,
          amount,
          remainingDeposit: obligation.depositedAmount,
        });
      },
    }),

    liquidate: ix({
      accounts: {
        reserve: p.mut(Reserve),
        obligation: p.mut(Obligation),
        record: p.create(LiquidationRecord),
        liquidatorLiquidity: p.tokenAccount().mut(),
        reserveLiquidity: p.tokenAccount().mut(),
        liquidator: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { repayAmount: u64 },
      run: (
        {
          reserve,
          obligation,
          record,
          liquidatorLiquidity,
          reserveLiquidity,
          liquidator,
        },
        { repayAmount },
        ctx,
      ) => {
        ctx.require(repayAmount > 0n, "InvalidAmount");
        ctx.require(
          obligation.healthBps < reserve.liquidationThresholdBps,
          "HealthyObligation",
        );
        ctx.require(
          liquidatorLiquidity.mint === reserve.assetMint,
          "InvalidMint",
        );
        const actualRepay =
          repayAmount > obligation.borrowedAmount
            ? obligation.borrowedAmount
            : repayAmount;
        const seizeAmount =
          actualRepay > obligation.collateralAmount
            ? obligation.collateralAmount
            : actualRepay;
        token.transfer({
          from: liquidatorLiquidity,
          to: reserveLiquidity,
          authority: liquidator,
          amount: actualRepay,
        });
        obligation.borrowedAmount -= actualRepay;
        obligation.collateralAmount -= seizeAmount;
        reserve.totalBorrows -= actualRepay;
        record.liquidator = liquidator;
        record.borrower = obligation.owner;
        record.reserve = reserve.key;
        record.repaidAmount = actualRepay;
        record.seizedCollateral = seizeAmount;
        record.timestamp = sol.timestamp();
        record.closed = false;
        ctx.emit("Liquidated", {
          liquidator,
          borrower: obligation.owner,
          reserve: reserve.key,
          repaidAmount: actualRepay,
          seizedCollateral: seizeAmount,
        });
      },
    }),

    accrueInterest: ix({
      accounts: {
        reserve: p.mut(Reserve),
      },
      run: ({ reserve }, ctx) => {
        const now = sol.timestamp();
        const elapsed = now - reserve.lastUpdated;
        ctx.require(elapsed >= 0n, "InvalidAmount");
        if (reserve.totalBorrows > 0n) {
          const interest =
            (reserve.totalBorrows * reserve.borrowRateBps) / 10000n;
          reserve.totalBorrows += interest;
          reserve.borrowIndex += interest;
        }
        if (reserve.totalDeposits > 0n) {
          reserve.utilizationBps =
            (reserve.totalBorrows * 10000n) / reserve.totalDeposits;
        } else {
          reserve.utilizationBps = 0n;
        }
        reserve.lastUpdated = now;
        ctx.emit("InterestAccrued", {
          reserve: reserve.key,
          totalBorrows: reserve.totalBorrows,
          utilizationBps: reserve.utilizationBps,
          timestamp: now,
        });
      },
    }),

    updateRisk: ix({
      accounts: {
        market: p.mut(MarketConfig),
        reserve: p.mut(Reserve),
        riskAuthority: p.signer(),
      },
      args: {
        liquidationThresholdBps: u64,
        maxBorrowBps: u64,
        borrowRateBps: u64,
        paused: bool,
      },
      run: (
        { market, reserve, riskAuthority },
        { liquidationThresholdBps, maxBorrowBps, borrowRateBps, paused },
        ctx,
      ) => {
        ctx.require(riskAuthority === market.riskAuthority, "Unauthorized");
        reserve.liquidationThresholdBps = liquidationThresholdBps;
        reserve.maxBorrowBps = maxBorrowBps;
        reserve.borrowRateBps = borrowRateBps;
        reserve.paused = paused;
        ctx.emit("RiskUpdated", {
          reserve: reserve.key,
          liquidationThresholdBps,
          maxBorrowBps,
          borrowRateBps,
        });
      },
    }),

    closeObligation: ix({
      accounts: {
        obligation: p.close(Obligation, "owner"),
        owner: p.signer(),
      },
      run: ({ obligation, owner }, ctx) => {
        ctx.require(owner === obligation.owner, "Unauthorized");
        ctx.require(obligation.borrowedAmount === 0n, "ObligationNotEmpty");
        ctx.require(obligation.depositedAmount === 0n, "ObligationNotEmpty");
        ctx.emit("ObligationClosed", { owner, reserve: obligation.reserve });
      },
    }),
}));

