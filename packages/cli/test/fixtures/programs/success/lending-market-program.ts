import { bs, cpi } from "better-sol/program";


const MarketConfig = bs.account({
  admin: bs.pubkey(),
  feeVault: bs.pubkey(),
  insuranceVault: bs.pubkey(),
  riskAuthority: bs.pubkey(),
  totalReserves: bs.u64(),
  paused: bs.bool(),
  bump: bs.u8(),
}).derive((seed) => ["lending_market", seed.admin]);

const Reserve = bs.account({
  market: bs.pubkey(),
  assetMint: bs.pubkey(),
  collateralMint: bs.pubkey(),
  liquidityVault: bs.pubkey(),
  feeVault: bs.pubkey(),
  totalDeposits: bs.u64(),
  totalBorrows: bs.u64(),
  borrowIndex: bs.u64(),
  depositIndex: bs.u64(),
  utilizationBps: bs.u64(),
  borrowRateBps: bs.u64(),
  liquidationThresholdBps: bs.u64(),
  maxBorrowBps: bs.u64(),
  lastUpdated: bs.i64(),
  paused: bs.bool(),
  bump: bs.u8(),
}).derive((seed) => ["reserve", seed.market, seed.assetMint]);

const Obligation = bs.account({
  owner: bs.pubkey(),
  reserve: bs.pubkey(),
  depositedAmount: bs.u64(),
  borrowedAmount: bs.u64(),
  collateralAmount: bs.u64(),
  lastAccrued: bs.i64(),
  healthBps: bs.u64(),
  flags: bs.u8(),
  bump: bs.u8(),
}).derive((seed) => ["obligation", seed.owner, seed.reserve]);

const LiquidationRecord = bs.account({
  liquidator: bs.pubkey(),
  borrower: bs.pubkey(),
  reserve: bs.pubkey(),
  repaidAmount: bs.u64(),
  seizedCollateral: bs.u64(),
  timestamp: bs.i64(),
  closed: bs.bool(),
}).derive((seed) => ["liquidation", seed.liquidator, seed.reserve]);

;

const events = {
  MarketInitialized: { admin: bs.pubkey(), riskAuthority: bs.pubkey() },
  ReserveCreated: { market: bs.pubkey(), reserve: bs.pubkey(), assetMint: bs.pubkey() },
  Deposited: {
    owner: bs.pubkey(),
    reserve: bs.pubkey(),
    amount: bs.u64(),
    collateralMinted: bs.u64(),
  },
  Borrowed: { owner: bs.pubkey(), reserve: bs.pubkey(), amount: bs.u64(), healthBps: bs.u64() },
  Repaid: { owner: bs.pubkey(), reserve: bs.pubkey(), amount: bs.u64(), remainingDebt: bs.u64() },
  Withdrawn: {
    owner: bs.pubkey(),
    reserve: bs.pubkey(),
    amount: bs.u64(),
    remainingDeposit: bs.u64(),
  },
  Liquidated: {
    liquidator: bs.pubkey(),
    borrower: bs.pubkey(),
    reserve: bs.pubkey(),
    repaidAmount: bs.u64(),
    seizedCollateral: bs.u64(),
  },
  InterestAccrued: {
    reserve: bs.pubkey(),
    totalBorrows: bs.u64(),
    utilizationBps: bs.u64(),
    timestamp: bs.i64(),
  },
  RiskUpdated: {
    reserve: bs.pubkey(),
    liquidationThresholdBps: bs.u64(),
    maxBorrowBps: bs.u64(),
    borrowRateBps: bs.u64(),
  },
  ObligationClosed: { owner: bs.pubkey(), reserve: bs.pubkey() },
}

export const lendingMarket = bs.program({
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
        market: bs.init(MarketConfig),
        admin: bs.signer(),
      },
      args: {
        feeVault: bs.pubkey(),
        insuranceVault: bs.pubkey(),
        riskAuthority: bs.pubkey(),
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
        market: bs.mut(MarketConfig),
        reserve: bs.init(Reserve),
        assetMint: bs.mint(),
        collateralMint: bs.mint().writable(),
        liquidityVault: bs.tokenAccount().writable(),
        feeVaultAccount: bs.tokenAccount().writable(),
        admin: bs.signer(),
        tokenProgram: bs.tokenProgram(),
      },
      args: {
        liquidationThresholdBps: bs.u64(),
        maxBorrowBps: bs.u64(),
        borrowRateBps: bs.u64(),
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
        reserve.lastUpdated = cpi.sol.timestamp();
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
        reserve: bs.mut(Reserve),
        obligation: bs.init(Obligation),
        userLiquidity: bs.tokenAccount().writable(),
        reserveLiquidity: bs.tokenAccount().writable(),
        userCollateral: bs.tokenAccount().writable(),
        collateralMint: bs.mint().writable(),
        owner: bs.signer(),
        tokenProgram: bs.tokenProgram(),
      },
      args: { amount: bs.u64() },
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
        cpi.token.transfer({
          from: userLiquidity,
          to: reserveLiquidity,
          authority: owner,
          amount,
        });
        cpi.token.mintTo({
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
        obligation.lastAccrued = cpi.sol.timestamp();
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
        reserve: bs.mut(Reserve),
        obligation: bs.mut(Obligation),
        reserveLiquidity: bs.tokenAccount().writable(),
        borrowerLiquidity: bs.tokenAccount().writable(),
        borrower: bs.signer(),
        tokenProgram: bs.tokenProgram(),
      },
      args: { amount: bs.u64() },
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
        cpi.token.transfer({
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
        reserve: bs.mut(Reserve),
        obligation: bs.mut(Obligation),
        payerLiquidity: bs.tokenAccount().writable(),
        reserveLiquidity: bs.tokenAccount().writable(),
        payer: bs.signer(),
        tokenProgram: bs.tokenProgram(),
      },
      args: { amount: bs.u64() },
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
        cpi.token.transfer({
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
        reserve: bs.mut(Reserve),
        obligation: bs.mut(Obligation),
        reserveLiquidity: bs.tokenAccount().writable(),
        userLiquidity: bs.tokenAccount().writable(),
        userCollateral: bs.tokenAccount().writable(),
        collateralMint: bs.mint().writable(),
        owner: bs.signer(),
        tokenProgram: bs.tokenProgram(),
      },
      args: { amount: bs.u64() },
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
        cpi.token.burn({
          from: userCollateral,
          mint: collateralMint,
          authority: owner,
          amount,
        });
        cpi.token.transfer({
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
        reserve: bs.mut(Reserve),
        obligation: bs.mut(Obligation),
        record: bs.init(LiquidationRecord),
        liquidatorLiquidity: bs.tokenAccount().writable(),
        reserveLiquidity: bs.tokenAccount().writable(),
        liquidator: bs.signer(),
        tokenProgram: bs.tokenProgram(),
      },
      args: { repayAmount: bs.u64() },
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
        cpi.token.transfer({
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
        record.timestamp = cpi.sol.timestamp();
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
        reserve: bs.mut(Reserve),
      },
      run: ({ reserve }, ctx) => {
        const now = cpi.sol.timestamp();
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
        market: bs.mut(MarketConfig),
        reserve: bs.mut(Reserve),
        riskAuthority: bs.signer(),
      },
      args: {
        liquidationThresholdBps: bs.u64(),
        maxBorrowBps: bs.u64(),
        borrowRateBps: bs.u64(),
        paused: bs.bool(),
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
        obligation: bs.close(Obligation, "owner"),
        owner: bs.signer(),
      },
      run: ({ obligation, owner }, ctx) => {
        ctx.require(owner === obligation.owner, "Unauthorized");
        ctx.require(obligation.borrowedAmount === 0n, "ObligationNotEmpty");
        ctx.require(obligation.depositedAmount === 0n, "ObligationNotEmpty");
        ctx.emit("ObligationClosed", { owner, reserve: obligation.reserve });
      },
    }),
}));

