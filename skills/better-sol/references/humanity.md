# Humanity and Sybil Resistance

Use this reference when building airdrop gating, DAO voting, allowlists, anti-bot measures, or any feature that needs to distinguish unique humans from duplicate wallets.

## Tools

- **Proof of Humanity (POH)** (`proofofhumanity.id`): Solana-native API that verifies wallet uniqueness. No KYC, no biometrics. Checks on-chain behavior patterns to assign a uniqueness score. Free tier available.
- **World ID** (Worldcoin): Biometric verification via the Orb. React component: `@worldcoin/idkit`. Returns a zero-knowledge proof of personhood. Strong uniqueness guarantee but requires user to have a World ID.
- **Civic Pass** (`@civic/common-gatekeeper`): Configurable identity verification (KYC, liveness check, document verification). On-chain gateway token model. Paid service.
- **Gitcoin Passport**: Multi-signal reputation score aggregating stamps from GitHub, Twitter, ENS, and other platforms. `@gitcoin/passport-sdk-verifier` for verification.
- **Turnstile** (Cloudflare): Free CAPTCHA alternative. `@cloudflare/turnstile-react` for React integration. Low-friction but minimal uniqueness guarantee.
- **hCaptcha**: Privacy-focused CAPTCHA. `@hcaptcha/react-hcaptcha` for React integration.

## Decision framework

### Choose enforcement level by stakes

| Stakes | Enforcement | Tool |
|---|---|---|
| Low (cosmetic airdrop, testnet) | CAPTCHA or none | Turnstile, hCaptcha |
| Medium (token airdrop, allowlist) | Wallet uniqueness | Proof of Humanity, Gitcoin Passport |
| High (DAO voting, treasury allocation) | Strong uniqueness | World ID, Civic Pass |
| Regulatory (token sale, regulated product) | KYC/identity verification | Civic Pass, custom KYC provider |

### Key tradeoffs

- **Friction vs security**: every verification step reduces conversion. CAPTCHA adds 5 seconds. KYC adds minutes to days.
- **Privacy vs uniqueness**: stronger verification requires more personal data. ZK-based tools (World ID, POH) minimize data exposure.
- **Cost**: CAPTCHA is free. POH has a free tier. Civic and KYC providers charge per verification.
- **Sybil resistance decay**: verification is a snapshot. A verified account can be sold or compromised. Recurring verification may be necessary for high-stakes use cases.

## Integration patterns

### Airdrop gating

```
1. User connects wallet
2. Frontend calls POH API with wallet address
3. If unique, show claim button
4. On claim, re-verify on the server side before signing the transfer transaction
5. Record the claim on-chain to prevent double-claiming from the same proof
```

Never trust only the frontend verification. Always re-verify server-side before executing the on-chain action.

### DAO voting

```
1. User connects wallet
2. Verify uniqueness via POH or World ID
3. Issue an on-chain verification token or store the verification status
4. Voting program checks for valid verification token before counting the vote
5. One verified identity = one vote, regardless of token holdings
```

### Allowlist

```
1. Pre-generate a list of verified wallet addresses off-chain
2. Store the Merkle root on-chain
3. User provides a Merkle proof with each transaction
4. Program verifies the proof and marks the leaf as used to prevent double-use
```

## On-chain enforcement

### Merkle allowlist program pattern

```ts
const Allowlist = bs.account({
  merkleRoot: bs.array(bs.u8(), 32),
  authority: bs.pubkey(),
  totalClaims: bs.u64(),
  maxClaims: bs.u64(),
}).derive((seed) => ["allowlist", seed.authority])

const ClaimRecord = bs.account({
  allowlist: bs.pubkey(),
  claimant: bs.pubkey(),
  claimedAt: bs.u64(),
}).derive((seed) => ["claim", seed.allowlist, seed.claimant])
```

The claim instruction verifies the Merkle proof, checks that the claim record does not already exist, creates it, and increments the claim counter.

### Verification token pattern

Issue a non-transferable token (NFT or Token-2022 with non-transferable extension) that proves verification. The downstream program checks for token ownership rather than re-verifying on every interaction.

This is more gas-efficient for repeated interactions (voting, claiming) but requires an initial issuance transaction.

## Sybil attack patterns

### Common attack vectors

- **Wallet farming**: create thousands of wallets using a single seed phrase. Each wallet has a unique address but is controlled by one entity.
- **Dusting**: distribute small amounts of tokens to many wallets to simulate activity.
- **Flash loan exploitation**: borrow tokens temporarily to meet balance thresholds, then return them after the check.
- **Social graph manipulation**: create fake social accounts to game multi-signal verifiers like Gitcoin Passport.
- **Verification resale**: obtain verification (KYC, biometric) and sell the verified account.

### Countermeasures

- **Balance over time**: check that the wallet has maintained a minimum balance for a duration, not just at a snapshot.
- **Transaction history**: require a minimum number of transactions over a minimum time period.
- **Multi-signal scoring**: combine on-chain behavior, social verification, and CAPTCHA rather than relying on any single signal.
- **Commit-reveal**: use commit-reveal schemes to prevent front-running of allowlist claims.
- **On-chain recording**: once a wallet claims, record it permanently on-chain to prevent re-claiming.

## Analysis framework

### Model sybil resistance economically

Sybil resistance is not binary. The question is whether the reward is greater than the cost of creating convincing fake identities.

```text
expected_profit = reward_per_identity * identities_accepted - cost_to_create_identities - detection_penalty
```

Raise attacker cost until expected profit is negative. For low-value actions, CAPTCHA may be enough. For token distributions, combine wallet history, uniqueness scoring, and claim records. For treasury voting, require stronger proof and delayed eligibility.

### False positives and false negatives

| Risk | Meaning | Product impact |
|---|---|---|
| False positive | Bot is accepted as human | Funds, votes, or access leak to attackers |
| False negative | Real user is rejected | Legitimate user churn and reputational damage |

Tune the system based on which error is more expensive. For an airdrop, false positives are expensive. For onboarding, false negatives may be more damaging because good users leave immediately.

### Signal quality rubric

Score every signal from 1 to 5:

| Signal | What to inspect | Weakness |
|---|---|---|
| Wallet age | First observed activity date | Old wallets can be bought |
| Transaction diversity | Distinct protocols, assets, counterparties | Bots can script diversity |
| Balance duration | Value held over time | Wealth-biased, excludes new users |
| Social proof | GitHub, Twitter, ENS, Discord | Farmable and privacy-invasive |
| Biometric proof | World ID or liveness | Strong but high friction |
| KYC | Government identity | Strong but expensive and regulatory-heavy |

Use multi-signal scoring when stakes are meaningful. Never let a single easily farmed signal decide eligibility.

### Privacy and consent

Human verification can become surveillance if poorly designed. Minimize collected data:

- Store only verification result, proof hash, expiration, and provider name.
- Avoid storing raw social handles, identity documents, or biometric data.
- Tell users why verification is required and how long it lasts.
- Provide an appeal path for rejected legitimate users.
- Separate identity verification from wallet analytics where possible.

### Operational response

If farming is detected after launch:

1. Pause new claims, not all protocol operations.
2. Snapshot suspicious patterns: common funding source, repeated timing, identical transaction graph.
3. Update eligibility rules prospectively when possible.
4. Publish the rule change and rationale.
5. Add an appeal process before clawbacks or public accusations.

## Anti-patterns

- Trusting only frontend verification without server-side re-check
- Using token balance alone as a uniqueness signal (one entity can hold tokens in many wallets)
- Relying on social account verification without checking account age and activity
- Airdropping to every wallet that ever transacted (includes exchanges, bots, and dead wallets)
- Using a single snapshot date that can be predicted and gamed
- Implementing verification without a mechanism to revoke or expire it

## Related

- `tokens.md` for SPL Token and Token-2022 distribution patterns.
- `dao-governance.md` for voting and governance-specific sybil resistance.
- `defi-deep-dive.md` for economic security considerations in incentive distribution.
