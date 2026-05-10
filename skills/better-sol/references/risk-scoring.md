# Risk Scoring

Use this reference when a review needs repeatable severity instead of intuition.

## Grounding

Use OWASP-style risk reasoning: severity comes from likelihood and impact. Business impact should override purely technical impact when known.

## Likelihood factors

Score each 1–3:

- Exploitability: how easy is the bug to trigger?
- Prerequisites: does the attacker need special timing, funds, authority, or private information?
- Discoverability: would a motivated attacker find it from public code or normal use?
- Reproducibility: does it work reliably?

Likelihood:

- Low: mostly 1s.
- Medium: mix of 1s and 2s.
- High: multiple 3s or a trivial public exploit path.

## Impact factors

Score each 1–3:

- Funds or assets at risk.
- Authority or privilege gained.
- User count or protocol surface affected.
- Data/secrets exposed.
- Recovery difficulty.

Impact:

- Low: limited inconvenience or hardening issue.
- Medium: loss, corruption, or denial of service with limited blast radius.
- High: fund loss, authority compromise, broad user impact, or hard recovery.

## Severity matrix

| Likelihood | Impact | Severity |
|---|---|---|
| Low | Low | Low |
| Low | Medium | Low/Medium |
| Low | High | Medium |
| Medium | Low | Medium |
| Medium | Medium | Medium |
| Medium | High | High |
| High | Low | Medium |
| High | Medium | High |
| High | High | Critical |

## Evidence rule

Every severity must cite the exploit path and affected asset. If the exploit path is hypothetical and not demonstrated in this code, lower severity or mark as hardening.

## Better Sol calibration examples

- Missing `ctx.require(authority === storedAuthority)` on a withdraw instruction: Critical or High depending on funds.
- Missing event for a state change: Low.
- `initIfNeeded` without reinitialization guard on authority-bearing account: High.
- Browser imports keypair file: Critical if production-bound, High if local demo.
- Missing test for unauthorized signer: Medium unless code is also missing the signer check.

## Related

- `attack-catalog.md` for concrete Solana attack examples.
- `test-plan.md` for regression test patterns that validate severity fixes.
