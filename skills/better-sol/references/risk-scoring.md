# Risk Scoring

Use this reference when calibrating severity for security findings, prioritizing fixes, and communicating risk to stakeholders.

## Severity levels

### Critical

Funds can be stolen, minted arbitrarily, or permanently locked. Private keys or upgrade authority can be compromised.

Examples:
- Arbitrary token mint through missing authority check
- Withdrawal without balance deduction
- Upgrade authority set to a single hot key on mainnet
- Private key exposed in client code
- Reinitialization attack that overwrites account authority

**Required response**: immediate fix, block deployment, notify all stakeholders. No deployment to mainnet until resolved.

### High

Authorization can be bypassed, PDA collisions can occur, arbitrary CPI targets are accepted, token substitution is possible, or economic incentives can be manipulated.

Examples:
- Missing signer check on a privileged instruction
- PDA seeds that can collide across different users
- CPI target not validated (attacker can call any program)
- Token mint not validated (attacker substitutes a fake token)
- Economic exploit where a user can drain rewards they did not earn

**Required response**: fix before any public deployment. Regression test required.

### Medium

Accounting edge cases, denial of service, replay attacks, weak deployment controls, or missing failure-path tests.

Examples:
- Integer overflow that reverts transactions but does not lose funds
- Account enumeration that allows DoS by filling PDA space
- Missing nonce or expiration on signed messages
- Program authority not set to multisig on mainnet
- Missing test coverage on error paths

**Required response**: fix before mainnet. Can deploy to devnet for testing.

### Low

Observability gaps, documentation issues, maintainability concerns, or hardening opportunities.

Examples:
- Missing event emission on state changes
- Incomplete program documentation
- Magic numbers instead of named constants
- Missing compute budget optimization
- No monitoring or alerting configured

**Required response**: fix before production. Does not block devnet deployment or hackathon demos.

## Calibration process

### Step 1: Identify the attack vector

Describe the exact sequence of actions an attacker would take:

```
1. Attacker creates a wallet
2. Attacker calls the withdraw instruction with a custom token account
3. The instruction does not verify the token mint
4. Attacker provides a token account for a token they control
5. Funds are sent to the attacker's fake token instead of the legitimate token
```

### Step 2: Assess impact

What is the worst-case outcome if this vulnerability is exploited?

- Can funds be stolen? How much?
- Can funds be locked permanently?
- Can unauthorized actions be performed?
- Can the program be rendered unusable?
- Can the exploit be repeated or is it one-time?

### Step 3: Assess likelihood

How easy is it to exploit?

- Does it require special access (admin, authority)?
- Does it require on-chain state that is easy or hard to create?
- Can it be exploited by any user or only specific roles?
- Is the exploit obvious or does it require deep protocol knowledge?

### Step 4: Assign severity

Combine impact and likelihood:

| | High impact | Medium impact | Low impact |
|---|---|---|---|
| Easy to exploit | Critical | High | Medium |
| Moderate effort | High | Medium | Low |
| Hard to exploit | Medium | Low | Low |

## Finding template

Every finding must contain all of these fields:

```markdown
## [SEC-NNN] Finding title

**Severity**: Critical / High / Medium / Low

**File**: `programs/counter.ts` (or specific instruction name)

**Description**: What the vulnerability is, in specific technical terms.

**Attack scenario**: Step-by-step description of how an attacker would exploit this.

**Impact**: What the attacker gains or what the protocol loses.

**Fix**: The exact code change that resolves the vulnerability.

**Validation**: How to verify the fix works (test case or verification step).

**Regression test**: Test name that prevents this from recurring.
```

## Communicating severity

### To developers

Use the technical finding template above. Include the exact code location and fix.

### To non-technical stakeholders

Translate severity into business impact:

- **Critical**: "Funds can be stolen. We cannot deploy until this is fixed."
- **High**: "An attacker could bypass authorization. We must fix this before launch."
- **Medium**: "Edge cases could cause transaction failures under specific conditions. Fix before mainnet."
- **Low**: "Hardening improvements that reduce risk and improve maintainability."

### To auditors

Provide the full finding with attack scenario, fix, and regression test. Auditors need reproducible evidence.

## Common mis-ratings

| Vulnerability | Common mis-rating | Correct rating |
|---|---|---|
| Missing signer check on admin instruction | Medium | High (anyone can call) |
| Integer overflow that reverts transaction | High | Medium (no fund loss, just DoS) |
| Unused variable in account struct | Low | Informational (not a finding) |
| Missing event emission | Informational | Low (observability gap) |
| Single-key upgrade authority on devnet | Low | Low (devnet has no real value) |
| Single-key upgrade authority on mainnet | Medium | High (single point of failure) |

## Calibration methodology

### Score impact and likelihood separately

Severity should not be a gut feeling. Score two dimensions:

| Dimension | Question |
|---|---|
| Impact | What is the worst credible consequence if exploited? |
| Likelihood | How realistic is exploitation given permissions, cost, timing, and required knowledge? |

A high-impact issue with low likelihood may be Medium or High depending on exploit preconditions. A low-impact issue with high likelihood is usually Low or Medium, not High.

### Confidence level

Every finding should include confidence:

| Confidence | Meaning |
|---|---|
| High | Reproduced with a test or direct code path |
| Medium | Strong static evidence, not yet reproduced |
| Low | Suspicious pattern, needs investigation |

Do not present low-confidence speculation as a confirmed vulnerability. Convert it into a verification task or explicitly mark it as a hardening recommendation.

### Exploitability checklist

Before assigning High or Critical, answer:

- Can an untrusted user reach the vulnerable instruction?
- Are required accounts user-controlled?
- Does the exploit require a race, oracle manipulation, or privileged signer?
- Does it work on mainnet with real constraints and fees?
- Can the result be repeated or only triggered once?
- Is there a monitoring or pause mechanism that reduces blast radius?

### Reporting discipline

A strong finding is actionable. It includes the vulnerable condition, exact impact, exploit path, minimal fix, and regression test. If any of those are missing, the finding is not ready for a security report.

## Related

- `attack-catalog.md` for known attack patterns to check against.
- `security-checklist.md` for the full program safety checklist.
- `test-plan.md` for regression test design.
- `threat-model.md` for infrastructure-level threat assessment.
