# 🔥 Flare Protocol

> A decentralized, open marketing protocol built on Stellar and Soroban smart contracts.
> Enabling trustless, permissionless marketing campaigns — referrals, social sharing, learn-to-earn, and ad attention — with automated on-chain reward distribution.

---

## Table of Contents

- [Overview](#overview)
- [Why Flare Protocol](#why-flare-protocol)
- [Architecture](#architecture)
- [System Components](#system-components)
  - [Smart Contracts (Soroban)](#smart-contracts-soroban)
  - [Oracle Backend (NestJS)](#oracle-backend-nestjs)
  - [Frontend (AngularJS)](#frontend-angularjs)
- [Marketing Modules](#marketing-modules)
  - [Referral Module](#1-referral-module)
  - [Social Sharing Module](#2-social-sharing-module)
  - [Learn-to-Earn Module](#3-learn-to-earn-module)
  - [Ad Attention Module](#4-ad-attention-module)
- [Smart Contract Architecture](#smart-contract-architecture)
  - [Registry Contract](#registry-contract)
  - [Campaign Manager Contract](#campaign-manager-contract)
  - [Reward Vault Contract](#reward-vault-contract)
- [Oracle & Signature Verification](#oracle--signature-verification)
- [Token Support](#token-support)
- [Participant Roles](#participant-roles)
- [Campaign Lifecycle](#campaign-lifecycle)
- [Protocol Fee Model](#protocol-fee-model)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Setup](#environment-setup)
  - [Running Locally](#running-locally)
- [Deployment](#deployment)
  - [Testnet Deployment](#testnet-deployment)
  - [Mainnet Deployment](#mainnet-deployment)
- [API Reference](#api-reference)
- [Security Model](#security-model)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Flare Protocol is a fully decentralized, open-marketplace marketing protocol built on the **Stellar blockchain** using **Soroban smart contracts**. It replaces centralized affiliate networks, ad platforms, and marketing dashboards with transparent, self-executing on-chain logic.

Any advertiser can create a campaign. Any user can earn by completing verified marketing actions. Rewards are automatically distributed in any Stellar-compatible asset — no intermediaries, no trust required.

**Core marketing actions supported:**
- 🔗 **Referrals** — earn for bringing new users into a product
- 📣 **Social Sharing** — earn for posting content on social platforms
- 🎓 **Learn-to-Earn** — earn for completing educational tasks or quizzes
- 👁️ **Ad Attention** — earn for viewing and engaging with ads

---

## Why Flare Protocol

| Problem (Traditional Marketing) | Flare Protocol Solution |
|---|---|
| Centralized platforms take 30–50% cuts | Protocol fee is minimal and transparent |
| Opaque attribution and tracking | All actions and payouts recorded on-chain |
| Delayed payouts (weeks/months) | Near-instant settlement (~5s on Stellar) |
| Fraud with no recourse | Oracle-verified proofs + on-chain nullifiers |
| Locked into one token/currency | Any Stellar asset supported |
| Permissioned access for advertisers | Fully open marketplace |
| No user data ownership | Self-sovereign wallets, no KYC required |

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                        SOROBAN CONTRACTS                          │
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │    Registry     │  │ Campaign Manager │  │  Reward Vault   │  │
│  │    Contract     │  │    Contract      │  │    Contract     │  │
│  │                 │  │                  │  │                 │  │
│  │ - Advertisers   │  │ - Create campaign│  │ - Hold assets   │  │
│  │ - Earner profiles│ │ - Pause/resume   │  │ - Verify sigs   │  │
│  │ - Campaign index│  │ - Drain/expire   │  │ - Payout claims │  │
│  └─────────────────┘  └──────────────────┘  └─────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
                  ▲                          ▲
                  │  oracle signature        │  claim + proof
                  │                          │
┌─────────────────────────────┐   ┌──────────────────────────────┐
│      NestJS Backend         │   │      AngularJS Frontend      │
│      (Oracle Layer)         │   │                              │
│                             │   │  ┌────────────────────────┐  │
│  ┌─────────────────────┐    │   │  │   Advertiser Portal    │  │
│  │ Verification Engine │    │   │  │  - Create campaigns    │  │
│  │ - Referral tracker  │    │   │  │  - Deposit assets      │  │
│  │ - Twitter/X API     │    │   │  │  - View analytics      │  │
│  │ - Task grader       │    │   │  └────────────────────────┘  │
│  │ - Ad session tracker│    │   │  ┌────────────────────────┐  │
│  └─────────────────────┘    │   │  │     Earner Portal      │  │
│  ┌─────────────────────┐    │   │  │  - Browse campaigns    │  │
│  │   Signing Service   │    │   │  │  - Connect wallet      │  │
│  │  ed25519 keypair    │    │   │  │  - Complete actions    │  │
│  │  signs verified     │    │   │  │  - Claim rewards       │  │
│  │  action proofs      │    │   │  └────────────────────────┘  │
│  └─────────────────────┘    │   └──────────────────────────────┘
│  ┌─────────────────────┐    │
│  │  Event Listener     │    │
│  │  Soroban events →   │    │
│  │  backend state sync │    │
│  └─────────────────────┘    │
└─────────────────────────────┘
```

---

## System Components

### Smart Contracts (Soroban)

Written in **Rust** and compiled to **WebAssembly**, deployed on the Stellar network via Soroban. Three core contracts handle the full lifecycle of a campaign.

| Contract | Responsibility |
|---|---|
| `registry` | Advertiser/earner registration, campaign indexing |
| `campaign_manager` | Campaign creation, state management, configuration |
| `reward_vault` | Asset custody, oracle signature verification, reward payouts |

### Oracle Backend (NestJS)

The backend acts as a **trusted oracle** — it verifies that off-chain marketing actions have actually occurred, then signs a cryptographic proof that the Soroban contract can verify on-chain. It never holds or moves funds directly.

Key responsibilities:
- Generate unique referral links and track conversions
- Call social platform APIs (Twitter/X, etc.) to verify posts
- Grade learn-to-earn task/quiz submissions
- Track ad attention sessions with anti-fraud logic
- Sign verified action proofs using `ed25519`
- Listen to Soroban contract events to sync state

### Frontend (AngularJS)

Two portals served from a single AngularJS application:

- **Advertiser Portal** — campaign creation wizard, asset deposit flows, real-time analytics dashboard
- **Earner Portal** — campaign discovery, Freighter wallet integration, action completion UI, earnings history

---

## Marketing Modules

### 1. Referral Module

**How it works:**
1. Earner connects wallet and generates a unique referral link tied to their Stellar public key
2. New user clicks the link and completes a qualifying action (signup, purchase, etc.)
3. NestJS backend detects the conversion event (via webhook or API polling)
4. Backend signs a proof: `sign(earner_pubkey + campaign_id + referee_pubkey + timestamp)`
5. Earner submits the signed proof to the Reward Vault contract
6. Contract verifies the signature, checks the nullifier map (no double-claim), and releases USDC/asset reward

**Features:**
- Multi-level referral chains (configurable depth per campaign)
- Commission splitting between referrer tiers
- Minimum qualifying action defined by the advertiser (e.g. "referred user must deposit >$10")
- Real-time referral dashboard

---

### 2. Social Sharing Module

**How it works:**
1. Advertiser defines campaign: platform (Twitter/X, etc.), required content (hashtag, mention, link), reward per post
2. Earner connects their social account via OAuth in the frontend
3. Earner creates and posts the required content
4. Backend polls/webhooks the social API, confirms the post exists and meets criteria (hashtag present, account age check, follower minimum, etc.)
5. Backend signs the proof and earner claims on-chain

**Supported platforms (v1):**
- Twitter / X
- _(LinkedIn, Instagram, Farcaster — roadmap)_

**Anti-fraud checks:**
- Minimum account age
- Minimum follower count (advertiser-configurable)
- Bot detection heuristics
- Post must remain live for N hours after claim

---

### 3. Learn-to-Earn Module

**How it works:**
1. Advertiser creates a campaign with educational content (articles, videos, slides) and an associated quiz/task
2. Earner reads/watches the content and submits answers via the frontend
3. NestJS backend grades the submission against the answer key
4. On passing score (advertiser-defined threshold, e.g. 80%), backend signs the completion proof
5. Earner claims reward on-chain

**Features:**
- Rich content support: text, video embeds, external URLs
- Multiple question types: multiple choice, true/false, short answer (graded server-side)
- Configurable pass threshold per campaign
- One attempt or multiple (advertiser choice)
- Certificate NFT minting on Stellar on completion (optional, roadmap)

---

### 4. Ad Attention Module

**How it works:**
1. Advertiser uploads ad creative (image, video, rich HTML) and defines attention criteria (e.g. "watch 30s video fully")
2. Earner views the ad in the Flare frontend
3. Frontend sends attention signals (scroll depth, video play events, time-on-page) to the NestJS backend
4. Backend validates the session meets the attention threshold and applies anti-fraud checks
5. Backend signs the proof, earner claims reward

**Anti-fraud:**
- Session token tied to wallet address
- Tab visibility API tracking (detects background tabs)
- Randomized interaction checkpoints (CAPTCHA-lite)
- Rate limiting per wallet per campaign per day
- IP reputation checks

---

## Smart Contract Architecture

### Registry Contract

Manages the identity layer of the protocol.

```rust
// Key data structures

pub struct AdvertiserProfile {
    pub address: Address,
    pub name: String,
    pub website: String,
    pub total_campaigns: u32,
    pub total_spent: i128,
    pub registered_at: u64,
}

pub struct EarnerProfile {
    pub address: Address,
    pub total_earned: i128,
    pub campaigns_completed: u32,
    pub registered_at: u64,
}

pub struct CampaignIndex {
    pub campaign_id: BytesN<32>,
    pub advertiser: Address,
    pub campaign_type: CampaignType,
    pub asset: Address,       // Stellar asset contract address
    pub created_at: u64,
}

pub enum CampaignType {
    Referral,
    Social,
    LearnToEarn,
    AdAttention,
}
```

**Key functions:**
- `register_advertiser(name, website)` — open, anyone can register
- `register_earner()` — wallet address becomes earner identity
- `index_campaign(campaign_id, advertiser, type, asset)` — called by Campaign Manager on creation
- `get_campaigns(filter, page, limit)` — paginated campaign discovery

---

### Campaign Manager Contract

Handles the full lifecycle of a campaign.

```rust
pub struct Campaign {
    pub id: BytesN<32>,
    pub advertiser: Address,
    pub campaign_type: CampaignType,
    pub asset: Address,            // any Stellar asset
    pub reward_per_action: i128,
    pub total_budget: i128,
    pub remaining_budget: i128,
    pub max_participants: u32,
    pub current_participants: u32,
    pub expiry: u64,               // Unix timestamp
    pub min_proof_threshold: u32,  // e.g. quiz pass %, follower count
    pub metadata_uri: String,      // IPFS/Arweave URI for campaign details
    pub state: CampaignState,
    pub oracle_pubkey: BytesN<32>, // backend's ed25519 public key
}

pub enum CampaignState {
    Active,
    Paused,
    Expired,
    Drained,
}
```

**Key functions:**
- `create_campaign(config)` — advertiser deposits budget upfront into Reward Vault
- `pause_campaign(campaign_id)` — advertiser only
- `resume_campaign(campaign_id)` — advertiser only
- `drain_campaign(campaign_id)` — reclaim unspent budget after expiry
- `update_metadata(campaign_id, uri)` — update off-chain campaign details
- `get_campaign(campaign_id)` — fetch campaign state
- `list_active_campaigns(type, page)` — filtered paginated listing

---

### Reward Vault Contract

The financial core of the protocol. Holds all campaign assets and processes claims.

```rust
pub struct ClaimProof {
    pub campaign_id: BytesN<32>,
    pub earner: Address,
    pub action_hash: BytesN<32>,   // hash of the specific action performed
    pub timestamp: u64,
    pub signature: BytesN<64>,     // ed25519 signature from oracle backend
}
```

**Key functions:**
- `deposit(campaign_id, asset, amount)` — called during campaign creation
- `claim(proof: ClaimProof)` — earner submits oracle-signed proof
  - Verifies ed25519 signature against campaign's `oracle_pubkey`
  - Checks nullifier map: `nullifiers[campaign_id + earner + action_hash]` must not exist
  - Writes nullifier to prevent double-claim
  - Transfers `reward_per_action` to earner (minus protocol fee)
  - Emits `RewardClaimed` event
- `withdraw(campaign_id)` — advertiser reclaims budget post-expiry
- `get_balance(campaign_id)` — query remaining budget

**Nullifier map** prevents double-claiming without requiring any trusted state. Once a `(campaign_id, earner, action_hash)` triple is used, it cannot be used again — ever.

---

## Oracle & Signature Verification

The oracle pattern is the bridge between off-chain actions and on-chain rewards.

### Flow

```
Off-chain action occurs
        │
        ▼
NestJS backend verifies action
        │
        ▼
Backend constructs message:
  msg = SHA256(campaign_id ‖ earner_pubkey ‖ action_hash ‖ timestamp)
        │
        ▼
Backend signs with ed25519 private key:
  signature = ed25519.sign(msg, oracle_private_key)
        │
        ▼
Signed proof returned to frontend
        │
        ▼
Earner submits ClaimProof to Reward Vault contract
        │
        ▼
Contract verifies:
  ed25519.verify(msg, signature, campaign.oracle_pubkey)
        │
        ▼
If valid → release reward
```

### Trust Assumptions

- The oracle backend's `ed25519` keypair is the only trusted component
- The private key is stored securely (HSM or AWS KMS in production)
- Each campaign stores the oracle's **public key** — enabling future multi-oracle support
- The backend's verification logic is open source and auditable

---

## Token Support

Flare Protocol supports **any Stellar asset** as a campaign reward token. This includes:

| Asset Type | Example | Notes |
|---|---|---|
| Stellar native | XLM | Direct support |
| Stellar classic assets | USDC, AQUA, yXLM | Via Stellar Asset Contract (SAC) |
| Custom issued assets | Your own token | Issue on Stellar, wrap as SAC |
| Soroban tokens | Any SEP-0041 token | Full support |

Advertisers specify the asset contract address when creating a campaign. The Reward Vault handles any SEP-0041 compliant token interface.

---

## Participant Roles

### Advertiser
- Any wallet can become an advertiser (permissionless)
- Creates campaigns, defines rules and budgets
- Deposits reward assets upfront (no credit — fully collateralized)
- Can pause, resume, or drain expired campaigns
- Pays protocol fee on each reward distributed

### Earner
- Any wallet can earn (permissionless)
- Browses and participates in active campaigns
- Completes off-chain actions verified by the oracle
- Submits proofs on-chain to claim rewards
- Builds an on-chain reputation profile over time

### Oracle (NestJS Backend)
- Operated by the Flare Protocol team (initially)
- Verifies off-chain actions
- Signs proofs for valid completions
- Does not custody or move funds
- Oracle public key is registered per campaign — enabling future decentralization

### Protocol (Treasury)
- Receives protocol fee from each claim
- Fee percentage is a contract-level parameter (governance-upgradeable)
- Treasury address is a multisig (production)

---

## Campaign Lifecycle

```
[Advertiser]                [Contract]               [Earner]
     │                          │                        │
     │── create_campaign() ────►│                        │
     │   (deposit budget)       │◄─── browse_campaigns() ┤
     │                          │                        │
     │                     ACTIVE STATE                  │
     │                          │                        │
     │                          │◄── complete action ────┤
     │                          │    (off-chain)         │
     │                          │                        │
     │                    [Oracle signs proof]           │
     │                          │                        │
     │                          │◄── claim(proof) ───────┤
     │                          │                        │
     │                          │──── transfer reward ──►│
     │                          │                        │
     │                     (budget drains...)            │
     │                          │                        │
     │                   EXPIRED/DRAINED STATE           │
     │                          │                        │
     │── drain_campaign() ─────►│                        │
     │◄── remaining budget ─────│                        │
```

---

## Protocol Fee Model

The protocol fee is deducted at the point of reward claim inside the Reward Vault contract. The fee rate is stored as a contract-level parameter and is upgradeable via governance (future).

```
earner_receives = reward_per_action × (1 - fee_rate)
treasury_receives = reward_per_action × fee_rate
```

The fee rate is **not set at launch** — it will be determined via community input and governance before mainnet. The contract supports a fee of `0` (fee-free period at launch is a valid strategy).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust, Soroban SDK |
| Blockchain | Stellar (Testnet → Mainnet) |
| Contract Testing | `soroban-sdk` test harness, `cargo test` |
| Backend | NestJS (Node.js / TypeScript) |
| Backend Auth | JWT + wallet signature verification |
| Backend DB | PostgreSQL (campaign state, verifications) |
| Backend Cache | Redis (session tracking, rate limiting) |
| Social APIs | Twitter/X API v2 |
| Signing | `tweetnacl` / `ed25519` (NestJS) |
| Frontend | AngularJS |
| Wallet Integration | Freighter Wallet (via `@stellar/freighter-api`) |
| Stellar SDK | `@stellar/stellar-sdk` (frontend + backend) |
| Asset storage | IPFS / Arweave (campaign metadata, ad creatives) |
| Deployment | Docker, Railway / Render (backend), Vercel (frontend) |
| Contract Deploy | Stellar CLI (`stellar contract deploy`) |

---

## Project Structure

```
flare-protocol/
│
├── contracts/                          # Soroban smart contracts (Rust)
│   ├── registry/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs                  # Contract entrypoint
│   │       ├── types.rs                # Data structures
│   │       ├── storage.rs              # Storage helpers
│   │       └── test.rs                 # Unit tests
│   ├── campaign_manager/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── types.rs
│   │       ├── storage.rs
│   │       └── test.rs
│   ├── reward_vault/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── types.rs
│   │       ├── storage.rs
│   │       ├── verify.rs               # ed25519 signature verification
│   │       └── test.rs
│   └── Cargo.toml                      # Workspace Cargo.toml
│
├── backend/                            # NestJS Oracle Backend
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── config/
│   │   │   └── configuration.ts
│   │   ├── auth/                       # Wallet signature auth
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.service.ts
│   │   │   └── wallet.guard.ts
│   │   ├── campaigns/                  # Campaign management API
│   │   │   ├── campaigns.module.ts
│   │   │   ├── campaigns.controller.ts
│   │   │   └── campaigns.service.ts
│   │   ├── referrals/                  # Referral tracking
│   │   │   ├── referrals.module.ts
│   │   │   ├── referrals.controller.ts
│   │   │   └── referrals.service.ts
│   │   ├── social/                     # Social verification
│   │   │   ├── social.module.ts
│   │   │   ├── social.controller.ts
│   │   │   ├── social.service.ts
│   │   │   └── providers/
│   │   │       └── twitter.provider.ts
│   │   ├── learn/                      # Learn-to-earn grading
│   │   │   ├── learn.module.ts
│   │   │   ├── learn.controller.ts
│   │   │   └── learn.service.ts
│   │   ├── attention/                  # Ad attention tracking
│   │   │   ├── attention.module.ts
│   │   │   ├── attention.controller.ts
│   │   │   └── attention.service.ts
│   │   ├── oracle/                     # Signing service
│   │   │   ├── oracle.module.ts
│   │   │   └── oracle.service.ts       # ed25519 sign/verify
│   │   ├── events/                     # Soroban event listener
│   │   │   ├── events.module.ts
│   │   │   └── events.service.ts
│   │   └── common/
│   │       ├── dto/
│   │       ├── guards/
│   │       └── interceptors/
│   ├── prisma/
│   │   └── schema.prisma               # DB schema
│   ├── test/
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                           # AngularJS Frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── app.js                  # App module
│   │   │   ├── app.routes.js
│   │   │   ├── advertiser/             # Advertiser portal
│   │   │   │   ├── dashboard/
│   │   │   │   ├── create-campaign/
│   │   │   │   └── analytics/
│   │   │   ├── earner/                 # Earner portal
│   │   │   │   ├── dashboard/
│   │   │   │   ├── campaigns/
│   │   │   │   └── earnings/
│   │   │   ├── shared/
│   │   │   │   ├── wallet/             # Freighter wallet service
│   │   │   │   ├── stellar/            # Stellar SDK service
│   │   │   │   └── components/
│   │   │   └── auth/
│   │   ├── assets/
│   │   └── index.html
│   └── package.json
│
├── docs/                               # Extended documentation
│   ├── architecture.md
│   ├── contract-api.md
│   ├── oracle-spec.md
│   └── deployment-guide.md
│
├── scripts/                            # Deployment & utility scripts
│   ├── deploy-testnet.sh
│   ├── deploy-mainnet.sh
│   └── generate-oracle-keypair.sh
│
├── docker-compose.yml                  # Local dev environment
├── .env.example
└── README.md
```

---

## Getting Started

### Prerequisites

Ensure you have the following installed:

```bash
# Rust (stable + wasm32 target)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Stellar CLI
cargo install --locked stellar-cli --features opt

# Node.js (v20+)
node --version  # >= 20.0.0

# NestJS CLI
npm install -g @nestjs/cli

# Docker & Docker Compose
docker --version
docker compose version
```

You will also need:
- A **Freighter wallet** browser extension for testing
- A **Stellar testnet account** (funded via Friendbot)
- **Twitter Developer API keys** (for social verification module)

---

### Environment Setup

**1. Clone the repository**

```bash
git clone https://github.com/your-org/flare-protocol.git
cd flare-protocol
```

**2. Configure environment variables**

```bash
# Root
cp .env.example .env

# Backend
cp backend/.env.example backend/.env
```

Key environment variables for the backend:

```env
# Stellar
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Contract addresses (populated after deployment)
REGISTRY_CONTRACT_ID=
CAMPAIGN_MANAGER_CONTRACT_ID=
REWARD_VAULT_CONTRACT_ID=

# Oracle keypair (generate with scripts/generate-oracle-keypair.sh)
ORACLE_PUBLIC_KEY=
ORACLE_PRIVATE_KEY=

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/flare

# Redis
REDIS_URL=redis://localhost:6379

# Twitter API
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_BEARER_TOKEN=

# JWT
JWT_SECRET=
```

**3. Generate oracle keypair**

```bash
chmod +x scripts/generate-oracle-keypair.sh
./scripts/generate-oracle-keypair.sh
# Outputs ORACLE_PUBLIC_KEY and ORACLE_PRIVATE_KEY — add to .env
# Store the private key securely. Never commit it.
```

---

### Running Locally

**1. Start infrastructure (PostgreSQL + Redis)**

```bash
docker compose up -d postgres redis
```

**2. Build and deploy contracts to testnet**

```bash
cd contracts

# Build all contracts
cargo build --target wasm32-unknown-unknown --release

# Deploy to testnet (requires funded Stellar account in .env)
cd ..
chmod +x scripts/deploy-testnet.sh
./scripts/deploy-testnet.sh
# Contract addresses will be printed and saved to .env
```

**3. Start the backend**

```bash
cd backend
npm install
npx prisma migrate dev
npm run start:dev
# API available at http://localhost:3000
```

**4. Start the frontend**

```bash
cd frontend
npm install
npm start
# App available at http://localhost:4200
```

---

## Deployment

### Testnet Deployment

```bash
# Deploy all contracts to Stellar testnet
./scripts/deploy-testnet.sh

# The script:
# 1. Builds all contracts to WASM
# 2. Deploys Registry, Campaign Manager, Reward Vault
# 3. Initializes contracts with correct cross-contract addresses
# 4. Outputs contract IDs to console and updates .env
```

### Mainnet Deployment

> ⚠️ **Mainnet deployment requires a full security audit of all Soroban contracts before proceeding.**

```bash
# Set STELLAR_NETWORK=mainnet in .env
# Ensure oracle private key is stored in HSM or AWS KMS
# Run deployment script
./scripts/deploy-mainnet.sh
```

Pre-mainnet checklist:
- [ ] All contracts audited by a third-party security firm
- [ ] Oracle private key in HSM / AWS KMS (not in .env)
- [ ] Backend rate limiting and DDoS protection enabled
- [ ] Protocol treasury is a multisig account
- [ ] Emergency pause mechanism tested
- [ ] Bug bounty program active

---

## API Reference

The NestJS backend exposes a REST API. Full OpenAPI/Swagger docs available at `/api/docs` when running.

### Authentication

All protected endpoints require wallet-based authentication:

```
POST /auth/challenge
→ Returns a nonce to sign

POST /auth/verify
Body: { publicKey, signature, nonce }
→ Returns JWT token

Authorization: Bearer <jwt>
```

### Key Endpoints

```
# Campaigns
GET    /campaigns                  # List all active campaigns
GET    /campaigns/:id              # Get campaign details
GET    /campaigns/:id/stats        # Campaign statistics

# Referrals
POST   /referrals/link             # Generate referral link
POST   /referrals/track            # Track referral conversion
POST   /referrals/proof/:campaignId  # Get signed proof for valid referral

# Social
POST   /social/verify              # Submit post URL for verification
GET    /social/proof/:campaignId   # Get signed proof if post verified

# Learn
POST   /learn/submit/:campaignId   # Submit quiz answers
GET    /learn/proof/:campaignId    # Get signed proof if passed

# Attention
POST   /attention/start            # Start ad attention session
POST   /attention/signal           # Send attention signals (heartbeat)
GET    /attention/proof/:campaignId  # Get signed proof if threshold met

# Oracle
GET    /oracle/pubkey              # Get oracle public key (per campaign)
```

---

## Security Model

### Threat Model

| Threat | Mitigation |
|---|---|
| Double-claiming a reward | On-chain nullifier map — once used, forever spent |
| Forged oracle signature | ed25519 signature verified on-chain against stored oracle pubkey |
| Oracle backend compromise | Oracle key in HSM; each campaign stores its own oracle pubkey (rotation possible) |
| Advertiser draining budget mid-campaign | Budget locked in Vault; drain only after expiry |
| Sybil attacks (fake social accounts) | Minimum account age + follower count checks in oracle |
| Reentrancy attacks | Soroban's execution model prevents reentrancy by design |
| Replay attacks | Timestamp + nullifier combination prevents reuse |
| Fake ad attention | Tab visibility tracking, interaction checkpoints, rate limiting |
| Admin key compromise | Treasury is multisig; contract admin is timelocked |

### Audit Scope

Before mainnet, the following require third-party audit:
1. `reward_vault` contract — signature verification and asset transfer logic
2. `campaign_manager` contract — state machine and access control
3. Oracle signing service — key management and proof construction

---

## Roadmap

### v1.0 — Core Protocol (Testnet)
- [x] Architecture design
- [ ] Registry, Campaign Manager, Reward Vault contracts
- [ ] NestJS oracle backend
- [ ] Referral module
- [ ] Social sharing module (Twitter/X)
- [ ] Learn-to-earn module
- [ ] Ad attention module
- [ ] AngularJS frontend (advertiser + earner portals)
- [ ] Testnet deployment

### v1.1 — Production Hardening
- [ ] Third-party smart contract audit
- [ ] Oracle key migration to HSM/AWS KMS
- [ ] Rate limiting and DDoS protection
- [ ] Mainnet deployment

### v2.0 — Decentralization
- [ ] Governance contract (DAO for protocol fee + parameter updates)
- [ ] Multi-oracle support (any verifier can register as oracle)
- [ ] Decentralized ad creative storage (IPFS-native)
- [ ] Additional social platforms (LinkedIn, Farcaster, Instagram)

### v3.0 — Ecosystem
- [ ] SDK for advertisers to integrate Flare into their own products
- [ ] Mobile app (React Native)
- [ ] Certificate NFTs for learn-to-earn completions
- [ ] Cross-chain support (via Stellar bridge)
- [ ] Analytics API for third-party dashboards

---

## Contributing

Contributions are welcome. Please read the contribution guidelines before opening a PR.

```bash
# Fork the repository
# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes
# Ensure contracts compile and tests pass
cd contracts && cargo test

# Ensure backend tests pass
cd backend && npm test

# Open a PR against main
```

All Soroban contract changes require:
- Unit tests covering the new logic
- Updated contract API docs in `docs/contract-api.md`
- Review from at least one core contributor

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <strong>Built on Stellar. Powered by Soroban. Open to everyone.</strong>
  <br />
  <br />
  <a href="https://stellar.org">Stellar</a> ·
  <a href="https://soroban.stellar.org">Soroban</a> ·
  <a href="#">Documentation</a> ·
  <a href="#">Discord</a>
</div>
