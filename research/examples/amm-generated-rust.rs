// ============================================================
// GENERATED OUTPUT: Anchor Rust code
// What our transpiler generates from amm-program.ts
// This is what gets compiled to sBPF and deployed on-chain.
// ============================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, MintTo, Burn};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("AMMxPooL11111111111111111111111111111111111");

// ── Error codes ──

#[error_code]
pub enum AmmError {
    #[msg("Caller is not authorized")]
    Unauthorized,
    #[msg("Pool does not exist or is inactive")]
    PoolDoesNotExist,
    #[msg("Not enough liquidity in the pool")]
    InsufficientLiquidity,
    #[msg("Output amount below minimum (slippage)")]
    SlippageExceeded,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Fee must be between 0 and 1000 basis points")]
    InvalidFeeBps,
}

// ── Events ──

#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub token_a: Pubkey,
    pub token_b: Pubkey,
}

#[event]
pub struct LiquidityAdded {
    pub pool: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
    pub lp_tokens: u64,
}

#[event]
pub struct LiquidityRemoved {
    pub pool: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
    pub lp_tokens: u64,
}

#[event]
pub struct SwapExecuted {
    pub pool: Pubkey,
    pub amount_in: u64,
    pub amount_out: u64,
    pub fee: u64,
    pub direction: u8,
}

#[event]
pub struct FeeUpdated {
    pub pool: Pubkey,
    pub new_fee_bps: u64,
}

// ── Account structs ──

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub total_pools: u64,
    pub fee_bps: u64,
    pub bump: u8,
}
// Space: 8 (discriminator) + 32 + 8 + 8 + 1 = 57

#[account]
pub struct Pool {
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_a_reserve: Pubkey,
    pub token_b_reserve: Pubkey,
    pub lp_mint: Pubkey,
    pub lp_supply: u64,
    pub fee_bps: u64,
    pub created_at: u64,
    pub admin: Pubkey,
    pub is_active: bool,
    pub total_volume_a: u64,
    pub total_volume_b: u64,
    pub bump: u8,
}
// Space: 8 + 32*5 + 8*6 + 1 + 1 = 178

// ── Program entrypoints ──

#[program]
pub mod amm {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let admin = &ctx.accounts.admin;

        config.admin = admin.key();
        config.total_pools = 0;
        config.fee_bps = 30;

        Ok(())
    }

    pub fn create_pool(ctx: Context<CreatePool>, fee_bps: u64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let pool = &mut ctx.accounts.pool;

        require!(ctx.accounts.creator.key() == config.admin, AmmError::Unauthorized);
        require!(fee_bps <= 1000, AmmError::InvalidFeeBps);

        pool.token_a_mint = ctx.accounts.token_a_mint.key();
        pool.token_b_mint = ctx.accounts.token_b_mint.key();
        pool.token_a_reserve = ctx.accounts.token_a_reserve.key();
        pool.token_b_reserve = ctx.accounts.token_b_reserve.key();
        pool.lp_mint = ctx.accounts.lp_mint.key();
        pool.lp_supply = 0;
        pool.fee_bps = fee_bps;
        pool.created_at = ctx.accounts.clock.unix_timestamp as u64;
        pool.admin = ctx.accounts.creator.key();
        pool.is_active = true;
        pool.total_volume_a = 0;
        pool.total_volume_b = 0;

        config.total_pools += 1;

        emit!(PoolCreated {
            pool: pool.key(),
            token_a: ctx.accounts.token_a_mint.key(),
            token_b: ctx.accounts.token_b_mint.key(),
        });

        Ok(())
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount_a: u64,
        amount_b: u64,
        min_lp_tokens: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        require!(pool.is_active, AmmError::PoolDoesNotExist);
        require!(amount_a > 0, AmmError::InvalidAmount);
        require!(amount_b > 0, AmmError::InvalidAmount);

        let mut lp_tokens: u64 = 0;

        if pool.lp_supply == 0 {
            lp_tokens = (amount_a * amount_b) / 1_000_000;
            require!(lp_tokens > 0, AmmError::InvalidAmount);
        } else {
            let lp_from_a = (amount_a * pool.lp_supply) / ctx.accounts.token_a_reserve.amount;
            let lp_from_b = (amount_b * pool.lp_supply) / ctx.accounts.token_b_reserve.amount;
            lp_tokens = if lp_from_a < lp_from_b { lp_from_a } else { lp_from_b };
        }

        require!(lp_tokens >= min_lp_tokens, AmmError::SlippageExceeded);

        // CPI: transfer token A from depositor to pool reserve
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor_token_a.to_account_info(),
                    to: ctx.accounts.token_a_reserve.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount_a,
        )?;

        // CPI: transfer token B from depositor to pool reserve
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor_token_b.to_account_info(),
                    to: ctx.accounts.token_b_reserve.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount_b,
        )?;

        // CPI: mint LP tokens to depositor (PDA-signed)
        let seeds = &[
            b"pool",
            pool.token_a_mint.as_ref(),
            pool.token_b_mint.as_ref(),
            &[pool.bump],
        ];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    to: ctx.accounts.depositor_lp.to_account_info(),
                    authority: pool.to_account_info(),
                },
                &[seeds],
            ),
            lp_tokens,
        )?;

        pool.lp_supply += lp_tokens;
        pool.total_volume_a += amount_a;
        pool.total_volume_b += amount_b;

        emit!(LiquidityAdded {
            pool: pool.key(),
            amount_a,
            amount_b,
            lp_tokens,
        });

        Ok(())
    }

    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        lp_tokens: u64,
        min_amount_a: u64,
        min_amount_b: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        require!(pool.is_active, AmmError::PoolDoesNotExist);
        require!(lp_tokens > 0, AmmError::InvalidAmount);
        require!(pool.lp_supply > 0, AmmError::InsufficientLiquidity);

        let amount_a = (lp_tokens * ctx.accounts.token_a_reserve.amount) / pool.lp_supply;
        let amount_b = (lp_tokens * ctx.accounts.token_b_reserve.amount) / pool.lp_supply;

        require!(amount_a >= min_amount_a, AmmError::SlippageExceeded);
        require!(amount_b >= min_amount_b, AmmError::SlippageExceeded);

        // CPI: burn LP tokens
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    from: ctx.accounts.withdrawer_lp.to_account_info(),
                    authority: ctx.accounts.withdrawer.to_account_info(),
                },
            ),
            lp_tokens,
        )?;

        // CPI: transfer token A from pool to withdrawer (PDA-signed)
        let seeds = &[
            b"pool",
            pool.token_a_mint.as_ref(),
            pool.token_b_mint.as_ref(),
            &[pool.bump],
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_a_reserve.to_account_info(),
                    to: ctx.accounts.withdrawer_token_a.to_account_info(),
                    authority: pool.to_account_info(),
                },
                &[seeds],
            ),
            amount_a,
        )?;

        // CPI: transfer token B from pool to withdrawer (PDA-signed)
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_b_reserve.to_account_info(),
                    to: ctx.accounts.withdrawer_token_b.to_account_info(),
                    authority: pool.to_account_info(),
                },
                &[seeds],
            ),
            amount_b,
        )?;

        pool.lp_supply -= lp_tokens;

        emit!(LiquidityRemoved {
            pool: pool.key(),
            amount_a,
            amount_b,
            lp_tokens,
        });

        Ok(())
    }

    pub fn swap_a_for_b(
        ctx: Context<SwapAForB>,
        amount_in: u64,
        min_out: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        require!(pool.is_active, AmmError::PoolDoesNotExist);
        require!(amount_in > 0, AmmError::InvalidAmount);

        let reserve_in = ctx.accounts.token_a_reserve.amount;
        let reserve_out = ctx.accounts.token_b_reserve.amount;
        let fee = (amount_in * pool.fee_bps) / 10000;
        let net_in = amount_in - fee;
        let amount_out = (net_in * reserve_out) / (reserve_in + net_in);

        require!(amount_out >= min_out, AmmError::SlippageExceeded);

        // CPI: transfer token A from trader to pool (user-signed)
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.trader_token_a.to_account_info(),
                    to: ctx.accounts.token_a_reserve.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            amount_in,
        )?;

        // CPI: transfer token B from pool to trader (PDA-signed)
        let seeds = &[
            b"pool",
            pool.token_a_mint.as_ref(),
            pool.token_b_mint.as_ref(),
            &[pool.bump],
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_b_reserve.to_account_info(),
                    to: ctx.accounts.trader_token_b.to_account_info(),
                    authority: pool.to_account_info(),
                },
                &[seeds],
            ),
            amount_out,
        )?;

        pool.total_volume_a += amount_in;
        pool.total_volume_b += amount_out;

        emit!(SwapExecuted {
            pool: pool.key(),
            amount_in,
            amount_out,
            fee,
            direction: 0,
        });

        Ok(())
    }

    pub fn swap_b_for_a(
        ctx: Context<SwapBForA>,
        amount_in: u64,
        min_out: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        require!(pool.is_active, AmmError::PoolDoesNotExist);
        require!(amount_in > 0, AmmError::InvalidAmount);

        let reserve_in = ctx.accounts.token_b_reserve.amount;
        let reserve_out = ctx.accounts.token_a_reserve.amount;
        let fee = (amount_in * pool.fee_bps) / 10000;
        let net_in = amount_in - fee;
        let amount_out = (net_in * reserve_out) / (reserve_in + net_in);

        require!(amount_out >= min_out, AmmError::SlippageExceeded);

        // CPI: transfer token B from trader to pool (user-signed)
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.trader_token_b.to_account_info(),
                    to: ctx.accounts.token_b_reserve.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            amount_in,
        )?;

        // CPI: transfer token A from pool to trader (PDA-signed)
        let seeds = &[
            b"pool",
            pool.token_a_mint.as_ref(),
            pool.token_b_mint.as_ref(),
            &[pool.bump],
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_a_reserve.to_account_info(),
                    to: ctx.accounts.trader_token_a.to_account_info(),
                    authority: pool.to_account_info(),
                },
                &[seeds],
            ),
            amount_out,
        )?;

        pool.total_volume_a += amount_out;
        pool.total_volume_b += amount_in;

        emit!(SwapExecuted {
            pool: pool.key(),
            amount_in,
            amount_out,
            fee,
            direction: 1,
        });

        Ok(())
    }

    pub fn update_fee(ctx: Context<UpdateFee>, new_fee_bps: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        require!(ctx.accounts.admin.key() == pool.admin, AmmError::Unauthorized);
        require!(new_fee_bps <= 1000, AmmError::InvalidFeeBps);

        pool.fee_bps = new_fee_bps;

        emit!(FeeUpdated {
            pool: pool.key(),
            new_fee_bps,
        });
        msg!("Fee updated to {}bps", new_fee_bps);

        Ok(())
    }
}

// ── Account validation structs ──

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = 57,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(fee_bps: u64)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = creator,
        space = 178,
        seeds = [b"pool", token_a_mint.key().as_ref(), token_b_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    /// CHECK: LP mint created by this instruction
    #[account(mut)]
    pub lp_mint: UncheckedAccount<'info>,

    /// CHECK: Token A reserve — created separately
    #[account(mut)]
    pub token_a_reserve: UncheckedAccount<'info>,

    /// CHECK: Token B reserve — created separately
    #[account(mut)]
    pub token_b_reserve: UncheckedAccount<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(amount_a: u64, amount_b: u64, min_lp_tokens: u64)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = token_a_reserve.mint == pool.token_a_mint
    )]
    pub token_a_reserve: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = token_b_reserve.mint == pool.token_b_mint
    )]
    pub token_b_reserve: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub depositor_token_a: Account<'info, TokenAccount>,

    #[account(mut)]
    pub depositor_token_b: Account<'info, TokenAccount>,

    #[account(mut)]
    pub depositor_lp: Account<'info, TokenAccount>,

    #[account(mut)]
    pub depositor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(lp_tokens: u64, min_amount_a: u64, min_amount_b: u64)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub token_a_reserve: Account<'info, TokenAccount>,

    #[account(mut)]
    pub token_b_reserve: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub withdrawer_token_a: Account<'info, TokenAccount>,

    #[account(mut)]
    pub withdrawer_token_b: Account<'info, TokenAccount>,

    #[account(mut)]
    pub withdrawer_lp: Account<'info, TokenAccount>,

    #[account(mut)]
    pub withdrawer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(amount_in: u64, min_out: u64)]
pub struct SwapAForB<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = token_a_reserve.mint == pool.token_a_mint
    )]
    pub token_a_reserve: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = token_b_reserve.mint == pool.token_b_mint
    )]
    pub token_b_reserve: Account<'info, TokenAccount>,

    #[account(mut)]
    pub trader_token_a: Account<'info, TokenAccount>,

    #[account(mut)]
    pub trader_token_b: Account<'info, TokenAccount>,

    #[account(mut)]
    pub trader: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(amount_in: u64, min_out: u64)]
pub struct SwapBForA<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub token_a_reserve: Account<'info, TokenAccount>,

    #[account(mut)]
    pub token_b_reserve: Account<'info, TokenAccount>,

    #[account(mut)]
    pub trader_token_a: Account<'info, TokenAccount>,

    #[account(mut)]
    pub trader_token_b: Account<'info, TokenAccount>,

    #[account(mut)]
    pub trader: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateFee<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    pub admin: Signer<'info>,
}
