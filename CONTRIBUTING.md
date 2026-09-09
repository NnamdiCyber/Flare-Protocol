# Contributing to Flare Protocol

Thank you for your interest in contributing. This document covers everything you need to get started.

---

## Table of Contents

- [What to Work On](#what-to-work-on)
- [Getting Started](#getting-started)
- [Branch Naming](#branch-naming)
- [Commit Format](#commit-format)
- [Pull Request Process](#pull-request-process)
- [Contract Contribution Rules](#contract-contribution-rules)
- [Backend Contribution Rules](#backend-contribution-rules)
- [Frontend Contribution Rules](#frontend-contribution-rules)
- [Testing Requirements](#testing-requirements)
- [Code Style](#code-style)

---

## What to Work On

The remaining 35% of the project is well-scoped and contributor-ready. Good starting points:

| Area | Task | Skill |
|---|---|---|
| Frontend | Earnings history + claim UI (`frontend/src/app/earner/earnings/`) | AngularJS |
| Frontend | Per-campaign participation flows (referral link, social post, quiz, ad viewer) | AngularJS |
| Frontend | Full advertiser campaign creation wizard with on-chain submission | AngularJS + Stellar SDK |
| Frontend | Advertiser analytics dashboard | AngularJS |
| Backend | LinkedIn social verification provider (`backend/src/social/providers/`) | NestJS |
| Backend | Farcaster social verification provider | NestJS |
| Scripts | `scripts/deploy-mainnet.sh` | Bash |
| Docs | `docs/deployment-guide.md` — full deployment walkthrough | Markdown |
| Tests | End-to-end integration tests | TypeScript |

Check open issues on GitHub for tasks that are already scoped and unassigned.

---

## Getting Started

```bash
# 1. Fork the repository, then clone your fork
git clone https://github.com/<your-username>/flare-protocol.git
cd flare-protocol

# 2. Start infrastructure
docker compose up -d postgres redis

# 3. Set up backend
cp backend/.env.example backend/.env
# Fill in backend/.env (JWT_SECRET minimum required to run tests)
cd backend && npm install && npx prisma migrate dev && cd ..

# 4. Set up frontend
cd frontend && npm install && cd ..

# 5. Run all tests to confirm a clean baseline
cd contracts && cargo test        # 30 tests
cd ../backend && npm test         # 55 tests
```

See `README.md` for full environment variable documentation.

---

## Branch Naming

Use the format `<type>/<short-description>`:

```
feat/earner-earnings-ui
fix/attention-rate-limit-redis-key
docs/deployment-guide
chore/update-soroban-sdk
```

Types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`

Branch off `main`. Do not branch off another feature branch.

---

## Commit Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

Examples:

```
feat(frontend): add earnings history controller and view
fix(attention): correct Redis TTL calculation for signal sessions
docs(oracle-spec): clarify timestamp byte encoding
test(reward_vault): add test for fee_rate=0 edge case
```

Scopes map to project directories: `contracts`, `registry`, `campaign_manager`, `reward_vault`, `backend`, `frontend`, `auth`, `referrals`, `social`, `learn`, `attention`, `oracle`, `events`, `docs`, `infra`.

Keep the subject line under 72 characters. Use the body to explain *why*, not *what*.

---

## Pull Request Process

1. **Open an issue first** for anything non-trivial so the approach can be agreed before you write code.
2. **One concern per PR.** Don't mix a feature with a refactor.
3. **Fill in the PR template** — summary, what was tested, and any known gaps.
4. **All tests must pass.** PRs with failing tests will not be reviewed.
5. **New contract logic requires a unit test** — see [Contract Contribution Rules](#contract-contribution-rules).
6. **New backend endpoints require a unit test** in `<module>.service.spec.ts`.
7. A PR needs **at least one approving review** from a core contributor before merge.
8. Squash merging is used — your branch commits become one commit on `main`.

---

## Contract Contribution Rules

These rules are non-negotiable for any change to `contracts/`:

- **Follow README.md exactly.** Do not rename structs, add fields, or change function signatures without opening an issue and getting explicit agreement first. The contract API is the integration boundary between all three layers.
- **Three contracts only:** `registry`, `campaign_manager`, `reward_vault`. Do not add new contracts without prior discussion.
- **Signing scheme is ed25519.** The oracle signs `SHA256(campaign_id ‖ earner_pubkey ‖ action_hash ‖ timestamp_le_u64)`. Any change to this breaks the NestJS oracle and requires coordinated changes across all three layers.
- **SEP-0041 only.** The Reward Vault must accept any Stellar asset via the SEP-0041 interface.
- **Every new or modified function requires a unit test** in `src/test.rs` before the PR will be considered.
- **`cargo test` must pass with zero warnings** on your branch.
- Update `docs/contract-api.md` for any function signature change.

---

## Backend Contribution Rules

- **Module structure is fixed.** The nine modules (`auth`, `campaigns`, `referrals`, `social`, `learn`, `attention`, `oracle`, `events`, `common`) match the README exactly. Do not rename or reorganise them.
- **New social platform providers** go in `backend/src/social/providers/` as `<platform>.provider.ts`, mirroring `twitter.provider.ts`.
- **All oracle proofs must go through `oracle.service.signProof()`** — do not construct signatures directly in module services.
- **`npm test` must pass** before opening a PR.
- New service methods need corresponding tests in the `.spec.ts` file for that module.

---

## Frontend Contribution Rules

- **AngularJS 1.x only.** The frontend uses AngularJS 1.x (`angular@1.8.3`). Do not introduce Angular 2+, React, Vue, or any other framework.
- **Follow the file and controller naming conventions** established in the existing modules.
- **Wallet interactions must go through `WalletService`** — do not call `@stellar/freighter-api` directly from controllers.
- **Backend API calls must go through `StellarService` or `$http`** — do not hardcode RPC URLs in controllers (use the service layer).

---

## Testing Requirements

| Layer | Command | Minimum bar |
|---|---|---|
| Soroban contracts | `cargo test` (in `contracts/`) | All tests pass, zero warnings |
| NestJS backend | `npm test` (in `backend/`) | All tests pass |
| Frontend | Manual smoke test in browser | Campaigns load, wallet connects |

There are no automated frontend tests yet — setting up a test framework for the AngularJS layer is a welcome contribution.

---

## Code Style

**Rust:** `cargo fmt` before committing. The CI will reject unformatted code.

**TypeScript/NestJS:** Prettier is configured in `backend/.prettierrc`. Run `npm run format` before committing.

**AngularJS:** Follow the existing controller/service patterns. Use `'use strict'` at the top of every file. Prefer `$q` for promises rather than native Promise in AngularJS services (keeps `$digest` cycle integration correct).

**Markdown:** No hard line wrapping in prose. Tables are fine.

---

Questions? Open a GitHub Discussion or ask in the project Discord.
