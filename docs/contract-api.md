# Flare Protocol — Contract API Reference

> **Version:** v1.0 (testnet)
> **Contracts:** `registry`, `campaign_manager`, `reward_vault`
> **SDK:** Soroban SDK 21.x
> **Network:** Stellar Testnet / Mainnet

---

## Table of Contents

- [Registry Contract](#registry-contract)
- [Campaign Manager Contract](#campaign-manager-contract)
- [Reward Vault Contract](#reward-vault-contract)
- [Shared Types](#shared-types)
- [Error Codes](#error-codes)

---

## Registry Contract

**Purpose:** Identity layer. Manages advertiser and earner profiles, and maintains a global campaign index used for discovery.

**Deployment:** Called internally by `campaign_manager` on campaign creation. Readable by the frontend via backend API.

---

### `register_advertiser`

Registers a new advertiser profile. Open and permissionless — any wallet can call.

**Signature**
```rust
pub fn register_advertiser(env: Env, name: String, website: String)
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `env` | `Env` | Soroban execution environment (injected) |
| `name` | `String` | Display name of the advertiser or organisation |
| `website` | `String` | Advertiser website URL (stored as-is, no validation) |

**Returns:** `()` — panics on error

**Access control:** None — any caller can register. Caller's address (`env.invoker()`) becomes the `AdvertiserProfile.address`.

**Storage:** Writes `AdvertiserProfile` to persistent storage keyed by `Symbol("adv") + address`.

**Panics**
- `AlreadyRegistered` — if an advertiser profile already exists for the caller's address.

---

### `register_earner`

Registers a new earner profile. Open and permissionless.

**Signature**
```rust
pub fn register_earner(env: Env)
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `env` | `Env` | Soroban execution environment (injected) |

**Returns:** `()` — panics on error

**Access control:** None — any wallet can become an earner.

**Storage:** Writes `EarnerProfile` to persistent storage keyed by `Symbol("earner") + address`.

**Panics**
- `AlreadyRegistered` — if an earner profile already exists for the caller's address.

---

### `index_campaign`

Adds a new campaign to the global campaign index. Called by the `campaign_manager` contract on campaign creation — not intended to be called directly by users.

**Signature**
```rust
pub fn index_campaign(
    env: Env,
    campaign_id: BytesN<32>,
    advertiser: Address,
    campaign_type: CampaignType,
    asset: Address,
)
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `env` | `Env` | Soroban execution environment |
| `campaign_id` | `BytesN<32>` | 32-byte unique campaign identifier |
| `advertiser` | `Address` | Stellar address of the campaign creator |
| `campaign_type` | `CampaignType` | One of `Referral`, `Social`, `LearnToEarn`, `AdAttention` |
| `asset` | `Address` | Stellar asset contract address (SEP-0041) |

**Returns:** `()` — panics on error

**Access control:** Should be called by `campaign_manager` contract only. In v1, access is permissive (any caller) — restrict via `require_auth` in a future upgrade.

**Storage:** Appends a `CampaignIndex` entry to the persistent `Vec<CampaignIndex>` keyed by `Symbol("campaigns")`.

**Panics**
- `AdvertiserNotRegistered` — if the `advertiser` address has no registered profile.

---

### `get_campaigns`

Paginated retrieval of indexed campaigns, with optional type filter.

**Signature**
```rust
pub fn get_campaigns(
    env: Env,
    filter: Option<CampaignType>,
    page: u32,
    limit: u32,
) -> Vec<CampaignIndex>
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `env` | `Env` | Soroban execution environment |
| `filter` | `Option<CampaignType>` | Optional campaign type filter. `None` returns all types. |
| `page` | `u32` | Zero-based page index |
| `limit` | `u32` | Number of items per page (max recommended: 20) |

**Returns:** `Vec<CampaignIndex>` — empty vector if no results or page exceeds bounds.

**Access control:** Read-only. No authentication required.

---

## Campaign Manager Contract

**Purpose:** Full campaign lifecycle management — creation, state transitions, and budget reclamation.

**Initialization:** Must be initialized once after deployment via `initialize(registry_address, vault_address)`.

---

### `initialize`

One-time initialisation. Sets cross-contract addresses for registry and vault.

**Signature**
```rust
pub fn initialize(env: Env, registry_address: Address, vault_address: Address)
```

**Panics**
- `AlreadyInitialized` — if called more than once.

---

### `create_campaign`

Creates a new campaign. The advertiser deposits the full budget upfront into the Reward Vault as part of this call.

**Signature**
```rust
pub fn create_campaign(env: Env, config: Campaign)
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `env` | `Env` | Soroban execution environment |
| `config` | `Campaign` | Full campaign configuration struct (see [Campaign type](#campaign)) |

**Returns:** `()` — panics on error

**Access control:** `config.advertiser` must `require_auth`. The caller must be the advertiser address embedded in the config.

**Side effects:**
1. Calls `registry.index_campaign(campaign_id, advertiser, type, asset)`
2. Calls `reward_vault.deposit(campaign_id, asset, total_budget)` — transfers `total_budget` tokens from the advertiser to the vault

**Panics**
- `ZeroBudget` — if `config.total_budget == 0`
- `ExpiryInPast` — if `config.expiry <= env.ledger().timestamp()`
- `DuplicateCampaignId` — if a campaign with the same `id` already exists

---

### `pause_campaign`

Pauses an active campaign. No new claims can be submitted while paused.

**Signature**
```rust
pub fn pause_campaign(env: Env, campaign_id: BytesN<32>)
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `campaign_id` | `BytesN<32>` | ID of the campaign to pause |

**Access control:** Caller must be the campaign's `advertiser` address (`require_auth`).

**State transition:** `Active → Paused`

**Panics**
- `Unauthorized` — if caller is not the advertiser
- `CampaignNotFound` — if campaign ID does not exist
- `InvalidState` — if campaign is not in `Active` state

---

### `resume_campaign`

Resumes a paused campaign.

**Signature**
```rust
pub fn resume_campaign(env: Env, campaign_id: BytesN<32>)
```

**State transition:** `Paused → Active`

**Access control:** Advertiser only.

**Panics**
- `InvalidState` — if campaign is not in `Paused` state

---

### `drain_campaign`

Reclaims the unspent budget from an expired or drained campaign. Transfers remaining funds from the vault back to the advertiser.

**Signature**
```rust
pub fn drain_campaign(env: Env, campaign_id: BytesN<32>)
```

**Access control:** Advertiser only.

**State transition:** `Expired | Drained → Drained`

**Side effects:** Calls `reward_vault.withdraw(campaign_id)`.

**Panics**
- `NotExpired` — if campaign state is not `Expired` or `Drained`
- `Unauthorized` — if caller is not the advertiser

---

### `update_metadata`

Updates the off-chain metadata URI for a campaign (e.g. if the IPFS CID changes).

**Signature**
```rust
pub fn update_metadata(env: Env, campaign_id: BytesN<32>, uri: String)
```

**Access control:** Advertiser only.

---

### `get_campaign`

Fetches a campaign by ID.

**Signature**
```rust
pub fn get_campaign(env: Env, campaign_id: BytesN<32>) -> Campaign
```

**Returns:** `Campaign` struct.

**Panics**
- `CampaignNotFound` — if no campaign with that ID exists.

---

### `list_active_campaigns`

Returns a page of active campaigns, with optional type filter.

**Signature**
```rust
pub fn list_active_campaigns(
    env: Env,
    campaign_type: Option<CampaignType>,
    page: u32,
) -> Vec<Campaign>
```

**Returns:** `Vec<Campaign>` — up to 10 items per page.

---

## Reward Vault Contract

**Purpose:** Custodian of all campaign reward budgets. Verifies oracle signatures, enforces nullifiers, and distributes rewards.

**Initialization:** Must be initialized once with `campaign_manager` address, treasury address, and initial fee rate.

---

### `initialize`

One-time initialisation.

**Signature**
```rust
pub fn initialize(
    env: Env,
    campaign_manager: Address,
    fee_rate: u32,
    treasury: Address,
)
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `campaign_manager` | `Address` | Campaign Manager contract address |
| `fee_rate` | `u32` | Protocol fee in basis points (100 = 1%, 0 = fee-free) |
| `treasury` | `Address` | Stellar address that receives protocol fees |

**Panics**
- `AlreadyInitialized` — if called more than once.

---

### `deposit`

Deposits the campaign budget from the advertiser into the vault. Called internally by `campaign_manager.create_campaign`.

**Signature**
```rust
pub fn deposit(env: Env, campaign_id: BytesN<32>, asset: Address, amount: i128)
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `campaign_id` | `BytesN<32>` | Campaign identifier |
| `asset` | `Address` | SEP-0041 token contract address |
| `amount` | `i128` | Amount in stroops (or smallest token unit) |

**Access control:** Should be called by `campaign_manager` only.

---

### `claim`

Core payout function. Verifies an oracle-signed proof and transfers the reward to the earner.

**Signature**
```rust
pub fn claim(env: Env, proof: ClaimProof)
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `proof` | `ClaimProof` | Oracle-signed claim proof (see [ClaimProof type](#claimproof)) |

**Returns:** `()` — panics on any validation failure

**Processing steps:**
1. Load campaign from `campaign_manager` to get `oracle_pubkey` and `reward_per_action`
2. Construct message: `SHA256(campaign_id ‖ earner_pubkey_bytes ‖ action_hash ‖ timestamp_le_u64)`
3. Verify `ed25519(message, proof.signature, campaign.oracle_pubkey)` — panics on failure
4. Check nullifier map: key `SHA256(campaign_id ‖ earner_bytes ‖ action_hash)` must not exist
5. Write nullifier to prevent double-claim
6. Calculate `earner_amount = reward_per_action * (10000 - fee_rate) / 10000`
7. Calculate `treasury_amount = reward_per_action * fee_rate / 10000`
8. Transfer `earner_amount` to `proof.earner`
9. Transfer `treasury_amount` to treasury (if fee_rate > 0)
10. Emit `RewardClaimed` event: `(campaign_id, earner, earner_amount)`

**Panics**
- `InvalidSignature` — oracle signature verification failed
- `AlreadyClaimed` — nullifier already exists (double-claim attempt)
- `InsufficientBudget` — campaign vault balance < `reward_per_action`
- `CampaignNotActive` — campaign state is not `Active`

---

### `withdraw`

Returns unspent campaign budget to the advertiser. Called by `campaign_manager.drain_campaign`.

**Signature**
```rust
pub fn withdraw(env: Env, campaign_id: BytesN<32>)
```

**Access control:** Should be called by `campaign_manager` only.

---

### `get_balance`

Returns the remaining budget for a campaign.

**Signature**
```rust
pub fn get_balance(env: Env, campaign_id: BytesN<32>) -> i128
```

**Returns:** `i128` — remaining balance in the campaign's token units.

---

## Shared Types

### `CampaignType`

```rust
pub enum CampaignType {
    Referral,
    Social,
    LearnToEarn,
    AdAttention,
}
```

### `CampaignState`

```rust
pub enum CampaignState {
    Active,
    Paused,
    Expired,
    Drained,
}
```

### `AdvertiserProfile`

```rust
pub struct AdvertiserProfile {
    pub address: Address,
    pub name: String,
    pub website: String,
    pub total_campaigns: u32,
    pub total_spent: i128,
    pub registered_at: u64,
}
```

### `EarnerProfile`

```rust
pub struct EarnerProfile {
    pub address: Address,
    pub total_earned: i128,
    pub campaigns_completed: u32,
    pub registered_at: u64,
}
```

### `CampaignIndex`

```rust
pub struct CampaignIndex {
    pub campaign_id: BytesN<32>,
    pub advertiser: Address,
    pub campaign_type: CampaignType,
    pub asset: Address,
    pub created_at: u64,
}
```

### `Campaign`

```rust
pub struct Campaign {
    pub id: BytesN<32>,
    pub advertiser: Address,
    pub campaign_type: CampaignType,
    pub asset: Address,
    pub reward_per_action: i128,
    pub total_budget: i128,
    pub remaining_budget: i128,
    pub max_participants: u32,
    pub current_participants: u32,
    pub expiry: u64,
    pub min_proof_threshold: u32,
    pub metadata_uri: String,
    pub state: CampaignState,
    pub oracle_pubkey: BytesN<32>,
}
```

### `ClaimProof`

```rust
pub struct ClaimProof {
    pub campaign_id: BytesN<32>,
    pub earner: Address,
    pub action_hash: BytesN<32>,
    pub timestamp: u64,
    pub signature: BytesN<64>,
}
```

---

## Error Codes

| Error | Contract | Description |
|---|---|---|
| `AlreadyRegistered` | registry | Duplicate advertiser or earner registration |
| `AdvertiserNotRegistered` | registry | Indexing a campaign for an unregistered advertiser |
| `CampaignNotFound` | campaign_manager | No campaign with the given ID |
| `DuplicateCampaignId` | campaign_manager | A campaign with this ID already exists |
| `ZeroBudget` | campaign_manager | `total_budget` must be > 0 |
| `ExpiryInPast` | campaign_manager | Expiry must be a future timestamp |
| `InvalidState` | campaign_manager | State transition not allowed from current state |
| `NotExpired` | campaign_manager | Drain attempted before campaign has expired |
| `Unauthorized` | campaign_manager | Caller is not the campaign's advertiser |
| `AlreadyInitialized` | campaign_manager, reward_vault | `initialize` called more than once |
| `InvalidSignature` | reward_vault | Oracle ed25519 signature verification failed |
| `AlreadyClaimed` | reward_vault | Nullifier already written — double-claim attempt |
| `InsufficientBudget` | reward_vault | Vault balance < reward_per_action |
| `CampaignNotActive` | reward_vault | Campaign is paused, expired, or drained |
