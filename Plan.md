# 🔥 Flare Protocol — 5-Day Intensive Development Plan

> **Goal:** Reach 65% completion in 5 days, producing a robust, contributor-ready foundation.
> **Stack:** Rust/Soroban (contracts) · NestJS/TypeScript (oracle backend) · AngularJS (frontend)
> **Reference:** All implementation decisions must stay aligned with `README.md`.

---

## Completion Targets by Layer

| Layer | Target After Day 5 |
|---|---|
| Soroban Contracts | 100% of core contracts written + tested |
| NestJS Oracle Backend | 80% — all modules scaffolded, core logic complete |
| AngularJS Frontend | 40% — app shell, wallet integration, campaign browser |
| Infrastructure | 100% — Docker, env setup, deploy scripts |
| Documentation | 70% — contract API docs, oracle spec |

**Overall: ~65%**

---

## Progress Tracker

```
Day 1 ░░░░░░░░░░░░░░░░░░░░  Contracts Foundation
Day 2 ░░░░░░░░░░░░░░░░░░░░  Contracts Completion + Tests
Day 3 ░░░░░░░░░░░░░░░░░░░░  NestJS Backend Core
Day 4 ░░░░░░░░░░░░░░░░░░░░  NestJS Modules + Oracle Signing
Day 5 ░░░░░░░░░░░░░░░░░░░░  Frontend Shell + Integration + Infra
```

---

## Constraints for the Coding Agent

Before each session, the coding agent must be reminded of these rules:

1. **Follow README.md exactly.** Do not introduce new modules, rename contracts, change data structures, or add features not described in the README.
2. **Three contracts only:** `registry`, `campaign_manager`, `reward_vault` — as named in the README project structure.
3. **Signing scheme is ed25519.** The oracle signs `SHA256(campaign_id ‖ earner_pubkey ‖ action_hash ‖ timestamp)`. Do not deviate.
4. **Token interface is SEP-0041.** The Reward Vault must accept any Stellar asset via SEP-0041, not just USDC.
5. **NestJS modules follow the README structure exactly:** `auth`, `campaigns`, `referrals`, `social`, `learn`, `attention`, `oracle`, `events`, `common`.
6. **AngularJS only — not Angular (v2+).** The frontend uses AngularJS 1.x with Freighter wallet integration.
7. **No new dependencies without justification** aligned with the README tech stack.
8. **Every contract function must have a unit test** before the day is considered done.

---

## Day 1 — Soroban Contracts: Foundation

**Objective:** Scaffold the full contracts workspace. Implement and test the `registry` contract completely.

**Completion contribution:** +10%

### Tasks

- [ ] Initialize Cargo workspace at `contracts/Cargo.toml` with members: `registry`, `campaign_manager`, `reward_vault`
- [ ] Scaffold `contracts/registry/` with `Cargo.toml`, `src/lib.rs`, `src/types.rs`, `src/storage.rs`, `src/test.rs`
- [ ] Scaffold `contracts/campaign_manager/` and `contracts/reward_vault/` with empty stubs (compile-ready)
- [ ] Implement `types.rs` for registry: `AdvertiserProfile`, `EarnerProfile`, `CampaignIndex`, `CampaignType` enum — exactly as specified in README
- [ ] Implement `storage.rs` for registry: storage key helpers using Soroban `Env` storage
- [ ] Implement `lib.rs` for registry with all four functions: `register_advertiser`, `register_earner`, `index_campaign`, `get_campaigns`
- [ ] Write unit tests in `test.rs` covering: advertiser registration, earner registration, campaign indexing, paginated campaign retrieval
- [ ] Verify `cargo test -p registry` passes with zero warnings

### Day 1 Coding Agent Prompt

```
You are implementing the Flare Protocol — a decentralized marketing protocol on Stellar/Soroban.
Your reference document is README.md. Do not deviate from the architecture, naming, or data
structures described there.

Today's task: Implement the `registry` Soroban smart contract in Rust.

Requirements (from README.md):
- Location: contracts/registry/src/
- Files to create: lib.rs, types.rs, storage.rs, test.rs
- Also create the workspace Cargo.toml at contracts/Cargo.toml with members
  ["registry", "campaign_manager", "reward_vault"]
- Also scaffold empty (stub) contracts for campaign_manager and reward_vault so the
  workspace compiles

Data structures to implement in types.rs (copy these exactly):
  - AdvertiserProfile { address, name, website, total_campaigns, total_spent, registered_at }
  - EarnerProfile { address, total_earned, campaigns_completed, registered_at }
  - CampaignIndex { campaign_id: BytesN<32>, advertiser, campaign_type, asset, created_at }
  - CampaignType enum: Referral, Social, LearnToEarn, AdAttention

Functions to implement in lib.rs:
  - register_advertiser(env, name: String, website: String)
  - register_earner(env)
  - index_campaign(env, campaign_id: BytesN<32>, advertiser: Address, campaign_type: CampaignType, asset: Address)
    — this will be called by the Campaign Manager contract on campaign creation
  - get_campaigns(env, filter: Option<CampaignType>, page: u32, limit: u32) -> Vec<CampaignIndex>

Storage design:
  - Use Soroban persistent storage
  - Key scheme: use Symbol keys for clarity (e.g. Symbol::new(&env, "adv"), Symbol::new(&env, "earner"))
  - Store campaigns in a Vec<CampaignIndex> for paginated retrieval

Tests to write in test.rs:
  - test_register_advertiser: registers an advertiser, reads back the profile, asserts fields match
  - test_register_earner: registers an earner, reads back the profile
  - test_index_campaign: registers an advertiser, indexes a campaign, asserts it appears in get_campaigns
  - test_get_campaigns_pagination: indexes 5 campaigns, retrieves page 0 with limit 2, asserts 2 results

Use soroban-sdk = { version = "21.0.0", features = ["testutils"] } in Cargo.toml for tests.
Run cargo test -p registry before finishing. All tests must pass.
Do not add any features not listed above.
```

---

## Day 2 — Soroban Contracts: Campaign Manager + Reward Vault

**Objective:** Implement and fully test the `campaign_manager` and `reward_vault` contracts. This completes the entire on-chain layer.

**Completion contribution:** +20%

### Tasks

**Campaign Manager:**
- [ ] Implement `types.rs`: `Campaign` struct and `CampaignState` enum — exactly as in README
- [ ] Implement `storage.rs`: helpers for campaign read/write by `BytesN<32>` ID
- [ ] Implement `lib.rs` with all functions: `create_campaign`, `pause_campaign`, `resume_campaign`, `drain_campaign`, `update_metadata`, `get_campaign`, `list_active_campaigns`
- [ ] `create_campaign` must: validate budget > 0, expiry > now, call registry's `index_campaign`, invoke `reward_vault.deposit`
- [ ] Access control: `pause_campaign`, `resume_campaign`, `drain_campaign` require `require_auth` on the advertiser address
- [ ] `drain_campaign` only executable when state is `Expired` or `Drained`
- [ ] Write unit tests for all state transitions and access control checks

**Reward Vault:**
- [ ] Implement `types.rs`: `ClaimProof` struct — exactly as in README
- [ ] Implement `verify.rs`: ed25519 signature verification using Soroban's `crypto` module
  - Message: `SHA256(campaign_id ‖ earner_pubkey ‖ action_hash ‖ timestamp)`
  - Verify against `campaign.oracle_pubkey`
- [ ] Implement `storage.rs`: balance tracking per campaign, nullifier map
- [ ] Implement `lib.rs` with: `deposit`, `claim`, `withdraw`, `get_balance`
- [ ] `claim` must: verify ed25519 sig, check nullifier, write nullifier, transfer tokens, emit `RewardClaimed` event
- [ ] Protocol fee deduction in `claim` — fee rate stored as contract param, supports `0`
- [ ] Write unit tests: valid claim, double-claim rejection, invalid signature rejection, withdrawal after expiry

### Day 2 Coding Agent Prompt

```
You are implementing the Flare Protocol — a decentralized marketing protocol on Stellar/Soroban.
Your reference document is README.md. Do not add any features, rename any structs, or change
any logic not described in README.md.

Today's task: Implement the `campaign_manager` and `reward_vault` Soroban contracts.

--- CAMPAIGN MANAGER ---

Location: contracts/campaign_manager/src/
Files: lib.rs, types.rs, storage.rs, test.rs

Data structures (from README.md — implement exactly):
  Campaign {
    id: BytesN<32>,
    advertiser: Address,
    campaign_type: CampaignType,   // import from registry types or redefine
    asset: Address,                // any Stellar asset (SEP-0041)
    reward_per_action: i128,
    total_budget: i128,
    remaining_budget: i128,
    max_participants: u32,
    current_participants: u32,
    expiry: u64,
    min_proof_threshold: u32,
    metadata_uri: String,
    state: CampaignState,
    oracle_pubkey: BytesN<32>,
  }

  CampaignState enum: Active, Paused, Expired, Drained

Functions (from README.md):
  - create_campaign(env, config: Campaign) — advertiser must call require_auth;
    validate budget > 0 and expiry > env.ledger().timestamp();
    call registry contract to index_campaign;
    call reward_vault contract to deposit budget
  - pause_campaign(env, campaign_id: BytesN<32>) — advertiser require_auth only
  - resume_campaign(env, campaign_id: BytesN<32>) — advertiser require_auth only
  - drain_campaign(env, campaign_id: BytesN<32>) — advertiser require_auth;
    only allowed when state == Expired or Drained; calls reward_vault.withdraw
  - update_metadata(env, campaign_id: BytesN<32>, uri: String) — advertiser require_auth
  - get_campaign(env, campaign_id: BytesN<32>) -> Campaign
  - list_active_campaigns(env, campaign_type: Option<CampaignType>, page: u32) -> Vec<Campaign>

Tests:
  - test_create_campaign: create a campaign, assert state == Active
  - test_pause_resume: create → pause → assert Paused → resume → assert Active
  - test_drain_requires_expiry: drain before expiry must panic
  - test_unauthorized_pause: non-advertiser pause must fail auth check

--- REWARD VAULT ---

Location: contracts/reward_vault/src/
Files: lib.rs, types.rs, storage.rs, verify.rs, test.rs

Data structures (from README.md — implement exactly):
  ClaimProof {
    campaign_id: BytesN<32>,
    earner: Address,
    action_hash: BytesN<32>,
    timestamp: u64,
    signature: BytesN<64>,   // ed25519 from oracle backend
  }

verify.rs:
  Implement verify_oracle_signature(env, proof: &ClaimProof, oracle_pubkey: BytesN<32>) -> bool
  Message construction: SHA256(campaign_id bytes ‖ earner pubkey bytes ‖ action_hash bytes ‖ timestamp as u64 le bytes)
  Use env.crypto().ed25519_verify(pubkey, message, signature)

lib.rs functions (from README.md):
  - deposit(env, campaign_id: BytesN<32>, asset: Address, amount: i128)
    — called by campaign_manager on create_campaign
  - claim(env, proof: ClaimProof)
    — verify ed25519 sig against campaign's oracle_pubkey
    — check nullifier map: key = (campaign_id, earner, action_hash) must not exist
    — write nullifier to prevent double-claim
    — transfer reward_per_action tokens to earner (minus protocol fee)
    — emit RewardClaimed event: (campaign_id, earner, amount)
  - withdraw(env, campaign_id: BytesN<32>)
    — only callable by campaign_manager (or advertiser via campaign_manager)
    — transfer remaining balance back
  - get_balance(env, campaign_id: BytesN<32>) -> i128

Protocol fee:
  - Store fee_rate as a contract-level parameter (basis points, e.g. 250 = 2.5%)
  - Support fee_rate = 0 (fee-free)
  - earner_receives = reward_per_action * (10000 - fee_rate) / 10000
  - treasury_receives = reward_per_action * fee_rate / 10000

Nullifier map key: use SHA256(campaign_id ‖ earner_bytes ‖ action_hash) as the storage key

Tests:
  - test_deposit_and_balance: deposit 1000, assert get_balance == 1000
  - test_valid_claim: mock valid oracle signature, claim, assert earner balance increased
  - test_double_claim_rejected: submit same proof twice, second must panic
  - test_invalid_signature_rejected: tampered signature must panic

Run cargo test before finishing. All tests must pass with zero warnings.
Do not add any functionality beyond what is described above.
```

---

## Day 3 — NestJS Backend: Project Scaffold + Core Modules

**Objective:** Bootstrap the NestJS project with the exact folder structure from README.md. Implement `auth`, `campaigns`, and `oracle` modules completely.

**Completion contribution:** +15%

### Tasks

- [ ] Bootstrap NestJS project at `backend/` using `nest new`
- [ ] Create exact folder structure from README.md: `auth`, `campaigns`, `referrals`, `social`, `learn`, `attention`, `oracle`, `events`, `common`
- [ ] Configure `configuration.ts` with all env vars from README `.env.example`: Stellar network, contract IDs, oracle keypair, DB, Redis, Twitter, JWT
- [ ] Set up Prisma with `schema.prisma` — models for: `Advertiser`, `Earner`, `Campaign`, `Referral`, `SocialVerification`, `LearnSubmission`, `AttentionSession`
- [ ] Implement `auth` module:
  - `POST /auth/challenge` — returns nonce to sign
  - `POST /auth/verify` — verifies Stellar wallet signature, returns JWT
  - `wallet.guard.ts` — JWT guard for protected routes
- [ ] Implement `campaigns` module:
  - `GET /campaigns` — list active campaigns (reads from chain via `@stellar/stellar-sdk`)
  - `GET /campaigns/:id` — campaign details
  - `GET /campaigns/:id/stats` — participation stats from DB
- [ ] Implement `oracle` module:
  - `oracle.service.ts` — loads ed25519 keypair from env, exposes `signProof(campaignId, earnerPubkey, actionHash, timestamp): Buffer`
  - Message construction: `SHA256(campaign_id ‖ earner_pubkey ‖ action_hash ‖ timestamp)` — matches contract verify logic exactly
  - `GET /oracle/pubkey` — returns oracle public key for a campaign
- [ ] Write unit tests for auth challenge/verify flow and oracle signing

### Day 3 Coding Agent Prompt

```
You are implementing the NestJS oracle backend for Flare Protocol.
Your reference document is README.md. Follow the folder structure, module names,
endpoint paths, and logic described there exactly. Do not rename modules, add new
endpoints, or introduce architectural patterns not in the README.

Tech stack (from README.md):
- NestJS (Node.js / TypeScript)
- PostgreSQL via Prisma
- Redis for caching/sessions
- @stellar/stellar-sdk for Stellar interaction
- tweetnacl for ed25519 signing
- JWT for auth

Today's task: Scaffold the full backend and implement auth, campaigns, and oracle modules.

--- PROJECT STRUCTURE ---
Create these folders under backend/src/ exactly as named in README.md:
  auth/, campaigns/, referrals/, social/, learn/, attention/, oracle/, events/, common/
  Each folder gets: <name>.module.ts, <name>.controller.ts (where applicable), <name>.service.ts

--- CONFIGURATION ---
Create backend/src/config/configuration.ts exporting a config object with these keys
(matching README.md .env.example):
  stellar.network, stellar.rpcUrl, stellar.networkPassphrase,
  contracts.registry, contracts.campaignManager, contracts.rewardVault,
  oracle.publicKey, oracle.privateKey,
  database.url, redis.url,
  twitter.apiKey, twitter.apiSecret, twitter.bearerToken,
  jwt.secret

--- PRISMA SCHEMA ---
Create backend/prisma/schema.prisma with these models:
  Advertiser { id, stellarAddress (unique), name, website, createdAt }
  Earner { id, stellarAddress (unique), totalEarned, campaignsCompleted, createdAt }
  Campaign { id (UUID), campaignId (bytes, unique), advertiserAddress, campaignType, asset, status, createdAt }
  Referral { id, campaignId, referrerAddress, refereeAddress, convertedAt, proofIssued }
  SocialVerification { id, campaignId, earnerAddress, postUrl, platform, verifiedAt, proofIssued }
  LearnSubmission { id, campaignId, earnerAddress, score, passed, submittedAt, proofIssued }
  AttentionSession { id, campaignId, earnerAddress, sessionToken, durationSeconds, completed, proofIssued }

--- AUTH MODULE ---
Endpoints (from README.md API Reference):
  POST /auth/challenge — body: { publicKey: string } → returns { nonce: string }
    Store nonce in Redis with 5-minute TTL keyed by publicKey
  POST /auth/verify — body: { publicKey, signature, nonce } → returns { accessToken: string }
    Verify the Stellar keypair signature over the nonce using @stellar/stellar-sdk
    Issue JWT signed with JWT_SECRET

wallet.guard.ts: standard NestJS JWT guard using @nestjs/jwt

--- CAMPAIGNS MODULE ---
Endpoints (from README.md API Reference):
  GET /campaigns — query Stellar RPC for active campaigns from the campaign_manager contract
    Use @stellar/stellar-sdk SorobanRpc to call list_active_campaigns
    Return array of campaign objects
  GET /campaigns/:id — call get_campaign on chain, return campaign data
  GET /campaigns/:id/stats — return participation stats from Prisma DB

--- ORACLE MODULE ---
oracle.service.ts:
  - On instantiation, load ORACLE_PRIVATE_KEY and ORACLE_PUBLIC_KEY from config
  - Implement signProof(campaignId: Buffer, earnerPubkey: Buffer, actionHash: Buffer, timestamp: number): Buffer
    Message: SHA256(campaignId ‖ earnerPubkey ‖ actionHash ‖ timestamp as 8-byte little-endian)
    Sign using tweetnacl nacl.sign.detached(message, privateKey)
    This MUST match the verify logic in the reward_vault Soroban contract's verify.rs
  - Implement verifyProof(...): boolean — for internal use before issuing signatures

GET /oracle/pubkey endpoint: returns the oracle public key as hex

--- TESTS ---
Write unit tests for:
  - auth.service: challenge creates nonce, verify validates signature and returns JWT
  - oracle.service: signProof produces a deterministic signature for known inputs

Run npm test before finishing. All tests must pass.
Do not add any modules, endpoints, or logic not listed above.
```

---

## Day 4 — NestJS Backend: Verification Modules + Event Listener

**Objective:** Implement all four verification modules (referrals, social, learn, attention) and the Soroban event listener. Each module follows the flow described in README.md.

**Completion contribution:** +15%

### Tasks

**Referral Module:**
- [ ] `POST /referrals/link` — generate unique referral link tied to earner's Stellar pubkey + campaign ID, store in DB
- [ ] `POST /referrals/track` — record conversion event (referee pubkey, campaign ID, timestamp) in DB
- [ ] `POST /referrals/proof/:campaignId` — verify referral is valid (conversion exists, not already claimed), call `oracle.service.signProof`, return signed `ClaimProof`

**Social Module:**
- [ ] `POST /social/verify` — accept post URL + earner pubkey + campaign ID; call Twitter/X API v2 to confirm post exists, meets hashtag/mention criteria, account age/follower minimums
- [ ] `GET /social/proof/:campaignId` — if verification passed, return oracle-signed proof
- [ ] `twitter.provider.ts` — encapsulate all Twitter API v2 calls

**Learn Module:**
- [ ] `POST /learn/submit/:campaignId` — accept quiz answers, grade against stored answer key, check pass threshold from campaign config
- [ ] `GET /learn/proof/:campaignId` — if submission passed, return oracle-signed proof

**Attention Module:**
- [ ] `POST /attention/start` — create session token tied to wallet address + campaign ID, store in Redis with TTL
- [ ] `POST /attention/signal` — receive heartbeat signals (scroll depth, video events, time-on-page), validate tab visibility, update session progress in Redis
- [ ] `GET /attention/proof/:campaignId` — if session meets attention threshold, return oracle-signed proof
- [ ] Anti-fraud: rate limiting per wallet per campaign per day (using Redis), IP checks

**Events Module:**
- [ ] `events.service.ts` — poll Stellar RPC for Soroban contract events from `reward_vault` and `campaign_manager`
- [ ] On `RewardClaimed` event: update earner `totalEarned` in DB, mark proof as used
- [ ] On campaign state change events: sync campaign status in DB

### Day 4 Coding Agent Prompt

```
You are implementing the NestJS oracle backend for Flare Protocol.
Your reference document is README.md. All module names, endpoint paths, verification
flows, and anti-fraud logic must match the README exactly. Do not add platforms,
endpoints, or verification steps not described there.

Today's task: Implement the referrals, social, learn, attention modules and the
Soroban event listener. The oracle module from Day 3 is already complete — use
oracle.service.ts to sign all proofs.

--- IMPORTANT CONSTRAINT ---
Every module that issues a signed proof must call oracle.service.signProof() with:
  - campaignId: Buffer (32 bytes)
  - earnerPubkey: Buffer (32 bytes, from Stellar public key)
  - actionHash: Buffer (32 bytes, SHA256 of the specific action data)
  - timestamp: number (unix seconds)
This matches the ed25519 verification logic in the reward_vault Soroban contract.
Do not invent a different proof format.

--- REFERRAL MODULE ---
Location: backend/src/referrals/
Endpoints (from README.md):
  POST /referrals/link
    Body: { earnerAddress: string, campaignId: string }
    Generate a unique slug (UUID), store Referral record in DB with earnerAddress + campaignId
    Return: { referralLink: string }  (e.g. https://app.flareprotocol.io/r/<slug>)

  POST /referrals/track
    Body: { slug: string, refereeAddress: string }
    Find referral by slug, record the conversion (refereeAddress, convertedAt = now)
    Return: { success: true }

  POST /referrals/proof/:campaignId
    Protected by wallet.guard (JWT auth)
    Check: referral exists for this earner + campaignId, conversion recorded, proofIssued == false
    actionHash = SHA256(refereeAddress bytes ‖ campaignId bytes)
    Call oracle.service.signProof, mark proofIssued = true
    Return: ClaimProof { campaignId, earner, actionHash, timestamp, signature } as hex strings

--- SOCIAL MODULE ---
Location: backend/src/social/
Endpoints (from README.md):
  POST /social/verify
    Body: { postUrl: string, earnerAddress: string, campaignId: string, platform: "twitter" }
    Fetch campaign config to get required hashtag/mention, min follower count, min account age
    Call twitter.provider.ts to verify: post exists, contains required content, account meets minimums
    Anti-fraud: minimum account age check, minimum follower count, bot heuristics
    Store SocialVerification record in DB
    Return: { verified: boolean, reason?: string }

  GET /social/proof/:campaignId
    Protected by wallet.guard
    Check: SocialVerification exists, verified == true, proofIssued == false
    actionHash = SHA256(postUrl bytes ‖ campaignId bytes)
    Call oracle.service.signProof, mark proofIssued = true
    Return: ClaimProof as hex strings

twitter.provider.ts:
  Wrap Twitter API v2 calls using the bearer token from config
  Methods: getPost(postId), getAccountInfo(username)
  Check: post text contains required hashtag/mention, account age > minimum, follower count > minimum

--- LEARN MODULE ---
Location: backend/src/learn/
Endpoints (from README.md):
  POST /learn/submit/:campaignId
    Protected by wallet.guard
    Body: { answers: Record<string, string> }
    Fetch answer key for campaign from DB (stored by advertiser on campaign creation)
    Grade: calculate score as percentage of correct answers
    Check against campaign's min_proof_threshold (pass threshold %)
    Store LearnSubmission in DB with score and passed flag
    Return: { passed: boolean, score: number }

  GET /learn/proof/:campaignId
    Protected by wallet.guard
    Check: LearnSubmission exists, passed == true, proofIssued == false
    actionHash = SHA256(earnerAddress bytes ‖ campaignId bytes ‖ score as u32 le bytes)
    Call oracle.service.signProof, mark proofIssued = true
    Return: ClaimProof as hex strings

--- ATTENTION MODULE ---
Location: backend/src/attention/
Endpoints (from README.md):
  POST /attention/start
    Protected by wallet.guard
    Body: { campaignId: string }
    Create session: sessionToken = UUID, store in Redis with key attention:<sessionToken>
    Redis value: { earnerAddress, campaignId, startTime, signals: [], completed: false }
    TTL: 2 hours
    Return: { sessionToken: string }

  POST /attention/signal
    Body: { sessionToken: string, signalType: "scroll"|"video_play"|"video_complete"|"heartbeat", value: number }
    Validate session exists in Redis and tab is active (client sends visibility state)
    Append signal to session data, update progress
    Anti-fraud: reject if signals come too fast (< 100ms apart) — bot detection
    If attention threshold met (e.g. video_complete received or total time >= required):
      Set session.completed = true, write AttentionSession to DB
    Return: { progress: number, completed: boolean }

  GET /attention/proof/:campaignId
    Protected by wallet.guard
    Check: AttentionSession in DB, completed == true, proofIssued == false
    Anti-fraud: rate limit — max 1 claim per wallet per campaign per day (check Redis)
    actionHash = SHA256(sessionToken bytes ‖ campaignId bytes)
    Call oracle.service.signProof, mark proofIssued = true
    Return: ClaimProof as hex strings

--- EVENTS MODULE ---
Location: backend/src/events/events.service.ts
  On startup: begin polling Stellar RPC every 5 seconds for events from:
    - reward_vault contract: filter for "RewardClaimed" events
    - campaign_manager contract: filter for state change events
  On RewardClaimed event: update Earner.totalEarned += amount in DB
  On campaign state change: update Campaign.status in DB

--- TESTS ---
Write unit tests for:
  - referrals.service: generate link, track conversion, issue proof
  - social.service: mock twitter provider, test verification pass/fail
  - learn.service: grade submission at pass/fail threshold
  - attention.service: session creation, signal processing, completion detection

Run npm test. All tests must pass.
Do not add any features, platforms, or endpoints beyond what is listed above.
```

---

## Day 5 — Frontend Shell + Infrastructure + Integration

**Objective:** Build the AngularJS application shell with wallet integration and campaign browser. Wire up Docker infrastructure and deployment scripts. Run end-to-end smoke tests.

**Completion contribution:** +5% (contracts at 100%, backend at 80%, frontend at 40%, infra at 100%)

### Tasks

**AngularJS Frontend:**
- [ ] Initialize project at `frontend/` with AngularJS 1.x and required dependencies
- [ ] Create `index.html` with AngularJS bootstrap, Freighter wallet script import
- [ ] Implement `app.js` — main AngularJS module with `ui-router` or `ngRoute`
- [ ] Implement `app.routes.js` — routes for advertiser and earner portals
- [ ] Implement `shared/wallet/wallet.service.js` — Freighter integration: `connect()`, `getPublicKey()`, `signTransaction(xdr)`
- [ ] Implement `shared/stellar/stellar.service.js` — wrap `@stellar/stellar-sdk`: build/submit transactions, call contracts
- [ ] Implement `auth/` — wallet-based login flow using `POST /auth/challenge` and `POST /auth/verify`
- [ ] Implement `earner/campaigns/` — fetch and display active campaigns list from `GET /campaigns`
- [ ] Implement `earner/dashboard/` — connected wallet info, earnings summary
- [ ] Stub `advertiser/create-campaign/` — form shell (full implementation post Day 5)

**Infrastructure:**
- [ ] Write `docker-compose.yml` with services: `postgres`, `redis` (as per README Running Locally)
- [ ] Write `backend/.env.example` with all keys from README env section
- [ ] Write root `.env.example`
- [ ] Write `scripts/generate-oracle-keypair.sh` — generates ed25519 keypair using Node.js tweetnacl, prints `ORACLE_PUBLIC_KEY` and `ORACLE_PRIVATE_KEY`
- [ ] Write `scripts/deploy-testnet.sh` — builds contracts to WASM, deploys Registry + Campaign Manager + Reward Vault to Stellar testnet, initializes with cross-contract addresses, outputs contract IDs

**Documentation:**
- [ ] Write `docs/contract-api.md` — full function signatures, parameters, return types for all three contracts
- [ ] Write `docs/oracle-spec.md` — message construction, signing format, ClaimProof structure, how frontend submits proof on-chain

### Day 5 Coding Agent Prompt

```
You are implementing the Flare Protocol frontend and infrastructure.
Your reference document is README.md. Use AngularJS 1.x (NOT Angular 2+).
Follow the project structure, file names, and portal descriptions in README.md exactly.

Today's tasks:
1. Build the AngularJS frontend application shell
2. Set up Docker infrastructure
3. Write deployment scripts
4. Write docs/contract-api.md and docs/oracle-spec.md

--- FRONTEND ---
Location: frontend/src/
Tech: AngularJS 1.x, @stellar/freighter-api, @stellar/stellar-sdk
Package manager: npm

index.html:
  Bootstrap AngularJS app module "flareApp"
  Include ui-router for routing
  Single-page app shell with nav: "Advertiser" | "Earner" links

app.js:
  angular.module('flareApp', ['ui.router', 'flareApp.wallet', 'flareApp.stellar',
    'flareApp.auth', 'flareApp.earner', 'flareApp.advertiser'])

app.routes.js:
  /earner/dashboard → earner/dashboard/dashboard.html + DashboardCtrl
  /earner/campaigns → earner/campaigns/campaigns.html + CampaignsCtrl
  /earner/earnings → earner/earnings/earnings.html + EarningsCtrl
  /advertiser/dashboard → advertiser/dashboard/dashboard.html + AdvertiserDashCtrl
  /advertiser/create-campaign → advertiser/create-campaign/create.html + CreateCampaignCtrl
  /advertiser/analytics → advertiser/analytics/analytics.html + AnalyticsCtrl
  default redirect to /earner/campaigns

shared/wallet/wallet.service.js:
  angular.factory('WalletService', ...)
  Methods:
    connect() — calls freighterApi.requestAccess(), returns Promise<void>
    isConnected() — calls freighterApi.isConnected(), returns Promise<boolean>
    getPublicKey() — calls freighterApi.getPublicKey(), returns Promise<string>
    signTransaction(xdr: string, network: string) — calls freighterApi.signTransaction(xdr, {network})

shared/stellar/stellar.service.js:
  angular.factory('StellarService', ...)
  Injects $http for backend API calls and WalletService for signing
  Methods:
    getCampaigns() — GET /campaigns from backend
    getCampaign(id) — GET /campaigns/:id
    submitTransaction(xdr) — submit signed XDR to Stellar RPC

auth/auth.service.js + auth/auth.controller.js:
  AuthService:
    login() — calls GET /auth/challenge, signs nonce with WalletService, calls POST /auth/verify, stores JWT
    logout() — clears JWT
    isAuthenticated() — checks JWT validity
    getToken() — returns stored JWT

earner/campaigns/campaigns.controller.js + campaigns.html:
  CampaignsCtrl:
    On load: call StellarService.getCampaigns(), display list
    Campaign card shows: name, type (Referral/Social/LearnToEarn/AdAttention), reward per action, asset, remaining budget
    "Participate" button — requires wallet connection

earner/dashboard/dashboard.controller.js + dashboard.html:
  DashboardCtrl:
    Show connected wallet address (truncated)
    Show total earned (from GET /campaigns stats or backend)
    Show campaigns participated count

advertiser/create-campaign/create.controller.js + create.html:
  CreateCampaignCtrl:
    Form fields stub: campaign type, asset address, reward per action, total budget, expiry date, max participants, metadata URI
    Submit button — stub (wired up post Day 5)

--- INFRASTRUCTURE ---

docker-compose.yml:
  services:
    postgres:
      image: postgres:16
      environment: POSTGRES_DB=flare, POSTGRES_USER=postgres, POSTGRES_PASSWORD=password
      ports: 5432:5432
      volumes: postgres_data:/var/lib/postgresql/data
    redis:
      image: redis:7-alpine
      ports: 6379:6379

backend/.env.example and root .env.example:
  Include every environment variable listed in README.md Environment Setup section
  Use empty values and descriptive comments for each key

scripts/generate-oracle-keypair.sh:
  #!/bin/bash
  Use node -e with tweetnacl to generate a random ed25519 keypair
  Print: ORACLE_PUBLIC_KEY=<hex> and ORACLE_PRIVATE_KEY=<hex>
  Include warning: "Store ORACLE_PRIVATE_KEY securely. Never commit it."

scripts/deploy-testnet.sh:
  #!/bin/bash
  Step 1: cd contracts && cargo build --target wasm32-unknown-unknown --release
  Step 2: Deploy registry contract using stellar contract deploy, capture contract ID
  Step 3: Deploy campaign_manager contract, capture contract ID
  Step 4: Deploy reward_vault contract, capture contract ID
  Step 5: Initialize contracts with cross-contract addresses
    (campaign_manager needs registry address and reward_vault address)
  Step 6: Print all contract IDs and write them to .env

--- DOCUMENTATION ---

docs/contract-api.md:
  Document all functions for registry, campaign_manager, reward_vault
  For each function: signature, parameters with types, return value, access control, errors

docs/oracle-spec.md:
  Document the oracle signing flow from README.md:
    - Message construction: SHA256(campaign_id ‖ earner_pubkey ‖ action_hash ‖ timestamp)
    - Byte encoding for each field
    - How the NestJS backend signs it (tweetnacl)
    - How the Soroban contract verifies it (env.crypto().ed25519_verify)
    - ClaimProof struct fields and their encoding for on-chain submission
    - Example flow for each of the 4 module types (referral, social, learn, attention)

Do not add any AngularJS services, controllers, routes, or scripts beyond what is listed above.
Ensure the frontend package.json includes: angular, angular-ui-router, @stellar/freighter-api, @stellar/stellar-sdk.
```

---

## End-of-Day Checklist (All Days)

Before marking a day complete, verify:

- [ ] All files are in the exact paths specified in README.md project structure
- [ ] All contract function names match README.md exactly
- [ ] All API endpoint paths match README.md API Reference exactly
- [ ] `cargo test` passes (Days 1 & 2)
- [ ] `npm test` passes (Days 3 & 4)
- [ ] No new dependencies introduced without a README.md reference
- [ ] No features added beyond what README.md specifies

---

## Completion Summary After Day 5

| Component | Files Complete | Status |
|---|---|---|
| `contracts/registry` | lib.rs, types.rs, storage.rs, test.rs | ✅ 100% |
| `contracts/campaign_manager` | lib.rs, types.rs, storage.rs, test.rs | ✅ 100% |
| `contracts/reward_vault` | lib.rs, types.rs, storage.rs, verify.rs, test.rs | ✅ 100% |
| `backend/auth` | module, service, controller, guard | ✅ 100% |
| `backend/campaigns` | module, service, controller | ✅ 100% |
| `backend/oracle` | module, service | ✅ 100% |
| `backend/referrals` | module, service, controller | ✅ 100% |
| `backend/social` | module, service, controller, twitter provider | ✅ 100% |
| `backend/learn` | module, service, controller | ✅ 100% |
| `backend/attention` | module, service, controller | ✅ 100% |
| `backend/events` | module, service | ✅ 100% |
| `frontend/shared` | wallet.service, stellar.service | ✅ 100% |
| `frontend/auth` | service, controller | ✅ 100% |
| `frontend/earner` | campaigns, dashboard (earnings stub) | 🔶 70% |
| `frontend/advertiser` | create-campaign stub, dashboard stub | 🔶 20% |
| `docs/` | contract-api.md, oracle-spec.md | ✅ 100% |
| `scripts/` | deploy-testnet.sh, generate-oracle-keypair.sh | ✅ 100% |
| `docker-compose.yml` | postgres + redis | ✅ 100% |
| `.env.example` files | root + backend | ✅ 100% |

**Total: ~65% — contributor-ready foundation.**

---

## What Contributors Pick Up From Day 6

The remaining 35% is well-scoped and documented for contributors:

- `frontend/advertiser/` — full campaign creation wizard, asset deposit flow, analytics dashboard
- `frontend/earner/earnings/` — earnings history and claim UI
- `frontend/earner/campaigns/` — per-campaign participation flows (referral link generator, social post submission, quiz UI, ad viewer)
- `backend/social/` — LinkedIn, Farcaster, Instagram providers (Twitter/X done)
- `scripts/deploy-mainnet.sh`
- `docs/deployment-guide.md` and `docs/architecture.md`
- Integration/e2e tests
- Testnet deployment and smoke testing

---

*Last updated: Day 0 — pre-development*
*Track progress by checking off tasks in each day's section.*
