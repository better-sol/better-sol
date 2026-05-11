# Threat Model

Use this reference when performing infrastructure-level security assessment, secrets management review, CI/CD pipeline security, and dependency supply chain analysis for a Solana project.

## Infrastructure threats

### Secret exposure

Scan for leaked secrets in code and git history:

```bash
grep -rn "private\|secret\|apikey\|api_key\|token\|password" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.env" . | grep -v node_modules | grep -v ".git"
```

Common leak locations:

- `.env` files committed to git
- Keypair JSON files in the repository root
- API keys hardcoded in client code
- RPC URLs with authentication tokens in frontend bundles
- Private keys in test fixtures
- Webhook secrets in server code

### Required mitigations

- All secrets in environment variables or secret managers (never in code)
- `.gitignore` must include: `**/*.json` (keypairs), `.env*`, `.better-sol/`, `node_modules/`
- Rotate any secret that was ever committed to git (GitHub search, git log)
- Use `git diff --staged` before every commit to check for secrets
- Add pre-commit hooks with tools like `git-secrets` or `trufflehog`

### Keypair management

- Devnet keypairs: `.better-sol/` directory, gitignored
- Mainnet keypairs: hardware wallet or HSM. Never on a developer laptop.
- Program upgrade authority: must be a multisig (Sqeam, Squads, or SPL Governance) on mainnet
- Program deployer: separate from upgrade authority. Deployer can be a hot key; upgrade authority must be cold or multisig.

## CI/CD pipeline security

### Threat vectors

- **Poisoned dependencies**: malicious packages in npm supply chain
- **Compromised build environment**: CI runner tampered with
- **Unauthorized deployments**: someone with CI access deploys a malicious program
- **Leaked secrets in CI logs**: sensitive values printed during build

### Mitigations

- Pin all dependency versions with lockfiles (`bun.lockb`). Run `bun audit` regularly.
- Use `npm.overrides` or `bun.overrides` to force specific versions of transitive dependencies.
- CI secrets (API keys, deployer keys) must be in repository secrets, not in code.
- Deploy jobs must require approval for mainnet deployments.
- Log output must not contain secrets. Use `***` masking.
- Use a minimal CI image with only required tools installed.
- Sign commits with GPG or SSH keys.

### Deployment pipeline security

```
devnet deploy → automatic on merge to main
mainnet deploy → manual approval + multisig authority
```

Never auto-deploy to mainnet. Every mainnet deployment must be reviewed and approved.

## Dependency supply chain

### Audit dependencies

```bash
bun audit
bun pm ls | grep -v node_modules
```

Review for:

- Unmaintained packages (no updates in 12+ months)
- Packages with known vulnerabilities
- Packages with suspicious code (network calls, file system access, eval)
- Packages with too many transitive dependencies
- Packages that are not widely used (low download count)

### Package review checklist

For every new dependency:

- [ ] Is it actively maintained? (commits in the last 3 months)
- [ ] Does it have a reasonable number of users? (npm downloads)
- [ ] Does the README link to a legitimate organization?
- [ ] Does the published package match the source code? (diff check)
- [ ] Does it have unnecessary permissions (file system, network, child process)?
- [ ] Are transitive dependencies reasonable?

## LLM/AI security

### Prompt injection risks

When using AI tools (coding agents, Copilot, Claude) for Solana development:

- AI-generated code may introduce security vulnerabilities that are hard to spot
- Generated code must be reviewed with the same rigor as human-written code
- Never trust AI-generated security-critical code without manual review
- AI tools may suggest deprecated or insecure patterns

### Agent skill supply chain

When installing agent skills:

- Review the skill's SKILL.md and references before installing
- Skills can instruct the agent to run arbitrary commands
- Pin skill versions to prevent unexpected updates
- Audit the skill's references for suspicious instructions (data exfiltration, network calls)

## OWASP Top 10 for Solana dApps

| OWASP Category | Solana-Specific Risk |
|---|---|
| Broken access control | Missing signer checks, wrong authority validation, uninitialized account acceptance |
| Cryptographic failures | Weak randomness, predictable PDA seeds, hardcoded keys |
| Injection | Arbitrary CPI targets, unsanitized instruction data, account substitution |
| Insecure design | Missing reinitialization checks, no overflow protection, single authority |
| Security misconfiguration | Open upgrade authority, unrevoked freeze authority, public admin endpoints |
| Vulnerable components | Outdated Solana CLI, vulnerable npm packages, deprecated SDK methods |
| Auth failures | Missing session validation, wallet replay attacks, expired transaction reuse |
| Data integrity | Missing account owner checks, unverified CPI results, unvalidated oracle data |
| Logging failures | Missing transaction monitoring, no error tracking, no anomaly detection |
| SSRF | RPC endpoint manipulation, arbitrary URL fetching in backend, oracle endpoint spoofing |

## STRIDE threat model for Solana programs

### Spoofing

- Attacker impersonates an authority by providing a forged signer
- Mitigation: verify `isSigner` on every authority account

### Tampering

- Attacker modifies account data by passing a writable account they control
- Mitigation: verify account owner, verify PDA derivation, check `isWritable` constraints

### Repudiation

- User denies having authorized a transaction
- Mitigation: all actions on Solana are signed and on-chain by design. Ensure logging covers the signing authority.

### Information disclosure

- Attacker reads sensitive account data by scanning the ledger
- Mitigation: do not store PII on-chain. Use hash references for off-chain data. Consider Token-2022 confidential transfers for amount privacy.

### Denial of service

- Attacher fills compute units, blocks accounts, or front-runs transactions
- Mitigation: compute budget limits, priority fees, durable nonce for time-insensitive transactions

### Elevation of privilege

- Attacker escalates from user to admin by exploiting an authority check gap
- Mitigation: separate admin and user authorities, use multisig for admin, never use a single key for program authority on mainnet

## Operational security checklist

- [ ] No secrets in git history (`git log -p | grep -i "key\|secret\|token"`)
- [ ] `.gitignore` covers keypairs, `.env`, `.better-sol/`
- [ ] Program upgrade authority is multisig or timelock on mainnet
- [ ] CI/CD does not auto-deploy to mainnet
- [ ] Dependencies audited and pinned
- [ ] RPC endpoints use rate limiting and authentication
- [ ] Error handling does not leak internal state or stack traces
- [ ] Logging covers transactions, errors, and authority changes
- [ ] Incident response plan exists for mainnet exploits
- [ ] Key rotation procedure documented

## Related

- `security-checklist.md` for program-level safety checks.
- `attack-catalog.md` for known Solana attack patterns.
- `risk-scoring.md` for severity calibration.
- `cross-chain-security.md` for cross-chain specific threats.
