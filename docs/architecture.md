# Flare Protocol — Architecture

> This document explains the system architecture described in `README.md` in greater depth.
> It is the reference for contributors making structural decisions.

---

## High-Level Design

Flare Protocol has three independently deployable layers:

```
┌──────────────────────────────────────────────────────┐
│              Stellar / Soroban (on-chain)             │
│  registry  ←→  campaign_manager  ←→  reward_vault    │
└──────────────────────────────────────────────────────┘
          ▲  oracle sig           ▲  claim proof
          │                       │
┌─────────────────────┐   ┌──────────────────────┐
│   NestJS Backend    │   │  AngularJS Frontend   │
│   (Oracle Layer)    │   │  (Advertiser + Earner │
│   Port 3000         │   │   Portals, Port 4200) │
└─────────────────────┘   └──────────────────────┘
          ▲                        ▲
┌─────────────────────┐
│  PostgreSQL + Redis  │
│  (Infra via Docker)  │
└─────────────────────┘
```

The three layers are **loosely coupled**:

- The frontend talks to the backend over REST and to Stellar directly for transaction submission.
- The backend talks to Stellar via the Soroban RPC and to PostgreSQL/Redis for state.
- The contracts are entirely self-contained — they do not call the backend. The oracle pattern runs in one direction only: backend → signs proof → frontend → submits to contract.

---

## Soroban Contracts

### Responsibility split

| Contract | Owns | Does NOT own |
|---|---|---|
| `registry` | Advertiser/earner identity, global campaign index | Campaign state, funds |
| `campaign_manager` | Campaign lifecycle (create, pause, resume, drain) | Funds custody, signature verification |
| `reward_vault` | Fund custody, oracle proof verification, payouts | Campaign creation, identity |

### Cross-contract call graph

```
campaign_manager.create_campaign()
    └─→ registry.index_campaign()         (register in discovery index)
    └─→ reward_vault.deposit()            (lock budget in vault)

campaign_manager.drain_campaign()
    └─→ reward_vault.withdraw()           (return unspent budget)

reward_vault.claim()
    └─→ campaign_manager.get_campaign()   (fetch oracle_pubkey + reward_per_action)
```

All other functions are standalone — no cross-contract calls.

### Storage design

Each contract uses Soroban **persistent** storage exclusively (data survives ledger archival). Temporary/instance storage is not used — all campaign and profile state must outlive the transaction.

Key scheme per contract:

**registry**
- `("adv", address)` → `AdvertiserProfile`
- `("earner", address)` → `EarnerProfile`
- `"campaigns"` → `Vec<CampaignIndex>`

**campaign_manager**
- `("campaign", campaign_id)` → `Campaign`
- `"campaign_ids"` → `Vec<BytesN<32>>` (for listing)
- `"registry"` → `Address` (cross-contract)
- `"vault"` → `Address` (cross-contract)

**reward_vault**
- `("balance", campaign_id)` → `i128`
- `("asset", campaign_id)` → `Address`
- `("null", nullifier_hash)` → `bool` (nullifier map)
- `"manager"` → `Address` (campaign_manager address)
- `"fee_rate"` → `u32`
- `"treasury"` → `Address`

### Oracle pattern

The reward_vault contract never calls the backend. Instead:

1. The backend signs a proof with its ed25519 private key.
2. The earner submits the signed proof to `reward_vault.claim()`.
3. The contract verifies the signature on-chain using `env.crypto().ed25519_verify()`.

This means **the contract has zero network dependencies** — it only needs the oracle's public key, which is stored per-campaign in the `Campaign` struct (`oracle_pubkey: BytesN<32>`).

The signing message is: `SHA256(campaign_id ‖ earner_pubkey_bytes ‖ action_hash ‖ timestamp_le_u64)` — 104 bytes pre-image → 32-byte digest → 64-byte ed25519 signature.

Full specification: `docs/oracle-spec.md`.

---

## NestJS Backend

### Role

The backend is a **trusted oracle**, not a fund custodian. It:

- Verifies that off-chain marketing actions actually occurred (API calls, DB checks, anti-fraud)
- Signs proofs for valid completions
- Listens to Soroban events to sync state into PostgreSQL

It never holds assets. If the backend is compromised, the attacker can issue false proofs — but only for campaigns whose `oracle_pubkey` matches the compromised key. The blast radius is bounded per campaign.

### Module responsibilities

```
auth/         Wallet challenge/verify → JWT issuance
campaigns/    Read-only proxy to Soroban campaign_manager contract
referrals/    Referral link generation, conversion tracking, proof issuance
social/       Social post verification (Twitter/X v2), proof issuance
learn/        Quiz grading against stored answer keys, proof issuance
attention/    Ad session tracking via Redis, anti-fraud, proof issuance
oracle/       ed25519 keypair management and signProof() implementation
events/       Soroban event polling → DB state sync
common/       PrismaService, RedisModule, shared DTOs
```

### Authentication flow

```
Browser                    Backend                    Stellar
  │                           │                          │
  │── POST /auth/challenge ──►│                          │
  │◄── { nonce } ─────────────│                          │
  │                           │                          │
  │  [Freighter signs nonce]  │                          │
  │                           │                          │
  │── POST /auth/verify ─────►│                          │
  │   { publicKey, sig, nonce}│── verify sig ───────────►│
  │◄── { accessToken: JWT } ──│◄── valid ────────────────│
```

The backend uses `@stellar/stellar-sdk` to verify that the signature was produced by the claimed Stellar public key. No passwords or emails are involved.

### Proof issuance pattern

Every verification module follows the same pattern:

1. Check DB: action exists, belongs to this earner + campaign, not already claimed
2. Construct `actionHash = SHA256(<module-specific-data>)`
3. Call `oracle.service.signProof(campaignId, earnerPubkey, actionHash, timestamp)`
4. Mark `proofIssued = true` in DB
5. Return `ClaimProof` as hex strings

The `actionHash` construction for each module is documented in `docs/oracle-spec.md`.

### State storage split

| Data | Where | Why |
|---|---|---|
| Campaign state, balances | Soroban (on-chain) | Source of truth, trustless |
| Referral conversions | PostgreSQL | Off-chain relational data |
| Social verifications | PostgreSQL | Indexed for proof lookup |
| Learn submissions + answer keys | PostgreSQL | Off-chain grading data |
| Attention sessions (in-progress) | Redis | Ephemeral, high-write |
| Attention sessions (completed) | PostgreSQL | Permanent record for proof |
| Auth nonces | Redis (5min TTL) | Short-lived, no persistence needed |
| Rate limit counters | Redis | High-frequency, TTL-based |

---

## AngularJS Frontend

### Module structure

```
flareApp                     (root module, app.js)
  ├── flareApp.wallet        (shared/wallet/wallet.service.js)
  ├── flareApp.stellar       (shared/stellar/stellar.service.js)
  ├── flareApp.auth          (auth/)
  ├── flareApp.earner        (earner/)
  └── flareApp.advertiser    (advertiser/)
```

### Data flow

```
WalletService (Freighter)
    │ getPublicKey()
    ▼
AuthService
    │ POST /auth/challenge → sign → POST /auth/verify → JWT
    ▼
StellarService / $http (with Bearer JWT)
    │ GET /campaigns, POST /referrals/proof/:id, etc.
    ▼
Backend API
```

For on-chain claim submission:

```
Backend returns ClaimProof (hex strings)
    │
    ▼
Frontend builds Soroban invocation transaction
(using @stellar/stellar-sdk TransactionBuilder)
    │
    ▼
WalletService.signTransaction(xdr, network)
    │ (Freighter popup)
    ▼
StellarService.submitTransaction(signedXdr)
    │ (POST to Stellar RPC sendTransaction)
    ▼
reward_vault.claim() executes on-chain
```

---

## Security Boundaries

### What is trustless (on-chain)

- Budget custody — funds only move via verified contract logic
- Nullifier enforcement — double-claims are impossible
- Oracle signature verification — contract independently verifies the ed25519 sig
- Campaign state machine — advertisers cannot drain active campaigns

### What requires oracle trust

- That the backend only signs proofs for actions that actually occurred
- The oracle private key security (HSM / AWS KMS in production)

### Mitigations

- Oracle private key is per-deployment (rotate by deploying a new campaign with a different `oracle_pubkey`)
- Backend signing logic is open source and auditable
- Protocol fee is deducted atomically in the contract — cannot be bypassed

---

## Scaling Considerations

- **Soroban state storage costs** scale with the number of campaigns and nullifiers. Nullifiers are permanent — design action hashes to be unique.
- **Redis** is the hot path for attention sessions. It must be deployed with persistence (`appendonly yes`) in production to survive restarts.
- **Event polling** runs every 5 seconds. Under high claim volume, consider switching to a WebSocket subscription on the Stellar RPC.
- **Twitter API rate limits** are the binding constraint on social verification throughput. Queue verifications and implement exponential backoff.
