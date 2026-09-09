# Flare Protocol — Oracle Specification

> **Version:** v1.0
> **Signing algorithm:** ed25519
> **Hash function:** SHA-256

This document specifies the oracle signing protocol that bridges off-chain action verification (NestJS backend) to on-chain reward distribution (Soroban reward_vault contract).

---

## Overview

The Flare Protocol oracle is a **signing oracle** — it does not custody or move funds. Its only job is to produce a cryptographic proof that a specific earner completed a specific action for a specific campaign. The `reward_vault` Soroban contract verifies this proof before releasing any funds.

```
Off-chain action verified by NestJS
           │
           ▼
Backend constructs ClaimProof message
           │
           ▼
Backend signs with ed25519 private key
           │
           ▼
Signed ClaimProof returned to frontend
           │
           ▼
Earner submits ClaimProof to reward_vault.claim()
           │
           ▼
Contract verifies ed25519 signature on-chain → releases reward
```

---

## Message Construction

The oracle signs a 32-byte SHA-256 digest. The pre-image is the concatenation of four fields in this exact order and encoding:

```
message = SHA256(
  campaign_id   (32 bytes, raw BytesN<32>)
  ‖ earner_pubkey (32 bytes, Stellar public key raw bytes — NOT base58/base32)
  ‖ action_hash  (32 bytes, action-specific SHA-256 hash, see below)
  ‖ timestamp    (8 bytes, Unix seconds, little-endian u64)
)
```

**Total pre-image length:** 32 + 32 + 32 + 8 = **104 bytes**

### Field Encoding Details

#### `campaign_id` — 32 bytes

The campaign ID as stored in the Soroban contract (`BytesN<32>`). When passed from the backend, this is a 32-byte `Buffer` decoded from the hex string representation.

```typescript
// NestJS — campaign_id encoding
const campaignIdBuf = Buffer.from(campaignIdHex, 'hex'); // 32 bytes
```

#### `earner_pubkey` — 32 bytes

The **raw 32-byte public key** of the earner's Stellar keypair, not the StrKey (G...) representation.

```typescript
// NestJS — decode Stellar StrKey to raw bytes
import { StrKey } from '@stellar/stellar-sdk';
const earnerPubkeyBuf = StrKey.decodeEd25519PublicKey(earnerStrKey); // 32 bytes
```

In Rust (contract side), `Address` is decoded the same way via Soroban's internal representation.

#### `action_hash` — 32 bytes

A SHA-256 hash of the specific action data. The action hash is **module-specific** — see the [Per-Module Action Hashes](#per-module-action-hashes) section below.

#### `timestamp` — 8 bytes, little-endian u64

Unix timestamp (seconds since epoch) at the time the proof is issued.

```typescript
// NestJS — timestamp encoding
const tsBuf = Buffer.allocUnsafe(8);
tsBuf.writeBigUInt64LE(BigInt(Math.floor(Date.now() / 1000)));
```

---

## Signing (NestJS Backend)

The oracle service uses `tweetnacl` for ed25519 signing.

```typescript
// oracle.service.ts — signProof
import * as nacl from 'tweetnacl';
import { createHash } from 'crypto';
import { StrKey } from '@stellar/stellar-sdk';

signProof(
  campaignId: Buffer,    // 32 bytes
  earnerPubkey: Buffer,  // 32 bytes (decoded from StrKey)
  actionHash: Buffer,    // 32 bytes
  timestamp: number,     // Unix seconds
): Buffer {
  // Encode timestamp as little-endian 8-byte buffer
  const tsBuf = Buffer.allocUnsafe(8);
  tsBuf.writeBigUInt64LE(BigInt(timestamp));

  // Construct pre-image (104 bytes)
  const preimage = Buffer.concat([campaignId, earnerPubkey, actionHash, tsBuf]);

  // SHA-256 digest (32 bytes)
  const message = createHash('sha256').update(preimage).digest();

  // ed25519 sign — returns 64-byte signature
  const signature = nacl.sign.detached(message, this.privateKey);

  return Buffer.from(signature); // 64 bytes
}
```

The `privateKey` is the full 64-byte tweetnacl secretKey (seed ‖ publicKey), loaded from `ORACLE_PRIVATE_KEY` env var.

---

## Verification (Soroban Contract)

```rust
// reward_vault/src/verify.rs
use soroban_sdk::{Bytes, BytesN, Env};
use crate::types::ClaimProof;

pub fn verify_oracle_signature(
    env: &Env,
    proof: &ClaimProof,
    oracle_pubkey: BytesN<32>,
) -> bool {
    // Encode timestamp as little-endian 8 bytes
    let ts_bytes = proof.timestamp.to_le_bytes();

    // Construct pre-image: campaign_id ‖ earner_bytes ‖ action_hash ‖ timestamp
    let mut preimage = Bytes::new(env);
    preimage.append(&proof.campaign_id.clone().into());
    // earner address bytes extracted from Address type
    preimage.append(&get_address_bytes(env, &proof.earner));
    preimage.append(&proof.action_hash.clone().into());
    preimage.append(&Bytes::from_slice(env, &ts_bytes));

    // SHA-256 digest
    let message = env.crypto().sha256(&preimage);

    // ed25519 verify — panics on invalid signature
    env.crypto().ed25519_verify(&oracle_pubkey, &message.into(), &proof.signature);
    true
}
```

The Soroban `env.crypto().ed25519_verify()` function panics (contract execution halts) if verification fails — the panic is the rejection mechanism.

---

## ClaimProof Structure

The `ClaimProof` is what the earner submits to `reward_vault.claim()`.

```rust
pub struct ClaimProof {
    pub campaign_id: BytesN<32>,  // 32-byte campaign ID
    pub earner: Address,          // Stellar address of the earner
    pub action_hash: BytesN<32>,  // 32-byte action-specific hash
    pub timestamp: u64,           // Unix seconds (when oracle signed)
    pub signature: BytesN<64>,    // 64-byte ed25519 signature from oracle
}
```

### Frontend Encoding

When the backend returns the proof to the frontend, all byte fields are hex-encoded strings:

```json
{
  "campaignId": "a1b2c3...32 bytes hex...",
  "earner": "GABC...Stellar G address...",
  "actionHash": "d4e5f6...32 bytes hex...",
  "timestamp": 1725000000,
  "signature": "7a8b9c...64 bytes hex..."
}
```

The frontend encodes these as `BytesN` when building the Soroban contract invocation transaction.

---

## Per-Module Action Hashes

The `action_hash` uniquely identifies the specific action that was verified. It prevents one proof from being reused for a different action.

### Referral Module

```typescript
// action_hash = SHA256(refereeAddress_bytes ‖ campaignId_bytes)
const refereeBytes = StrKey.decodeEd25519PublicKey(refereeAddress); // 32 bytes
const actionHash = createHash('sha256')
  .update(Buffer.concat([refereeBytes, campaignIdBuf]))
  .digest(); // 32 bytes
```

**Semantic meaning:** "This specific referee was referred by this earner in this campaign."

---

### Social Sharing Module

```typescript
// action_hash = SHA256(postUrl_utf8 ‖ campaignId_bytes)
const actionHash = createHash('sha256')
  .update(Buffer.concat([Buffer.from(postUrl, 'utf8'), campaignIdBuf]))
  .digest(); // 32 bytes
```

**Semantic meaning:** "This specific social post was verified for this campaign."

---

### Learn-to-Earn Module

```typescript
// action_hash = SHA256(earnerAddress_bytes ‖ campaignId_bytes ‖ score_le_u32)
const earnerBytes = StrKey.decodeEd25519PublicKey(earnerAddress); // 32 bytes
const scoreBuf = Buffer.allocUnsafe(4);
scoreBuf.writeUInt32LE(score); // score as percentage integer, e.g. 85

const actionHash = createHash('sha256')
  .update(Buffer.concat([earnerBytes, campaignIdBuf, scoreBuf]))
  .digest(); // 32 bytes
```

**Semantic meaning:** "This earner passed this quiz with this score in this campaign."

---

### Ad Attention Module

```typescript
// action_hash = SHA256(sessionToken_utf8 ‖ campaignId_bytes)
const actionHash = createHash('sha256')
  .update(Buffer.concat([Buffer.from(sessionToken, 'utf8'), campaignIdBuf]))
  .digest(); // 32 bytes
```

**Semantic meaning:** "This specific attention session (uniquely identified by sessionToken) was completed for this campaign."

---

## Nullifier Map

The `reward_vault` contract prevents double-claiming using a nullifier map. Once a proof is claimed, the nullifier is permanently written to contract storage.

**Nullifier key construction (Rust):**

```rust
// nullifier_key = SHA256(campaign_id ‖ earner_bytes ‖ action_hash)
let mut null_preimage = Bytes::new(env);
null_preimage.append(&proof.campaign_id.clone().into());
null_preimage.append(&get_address_bytes(env, &proof.earner));
null_preimage.append(&proof.action_hash.clone().into());
let nullifier = env.crypto().sha256(&null_preimage);
```

The nullifier is stored as a boolean flag in persistent contract storage. If the key already exists, the `claim` function panics with `AlreadyClaimed`.

---

## Trust Model

- The oracle private key is the **only** trusted off-chain component.
- All signing logic is open source — the community can audit that the backend only signs legitimate actions.
- Each campaign stores the oracle's **public key** on-chain — enabling rotation if the key is compromised, and future multi-oracle architectures.
- In production, `ORACLE_PRIVATE_KEY` must be stored in an HSM or AWS KMS — never in `.env` files or source code.

---

## Full Example: Referral Claim Flow

```
1. Earner generates a referral link → backend records (earnerAddress, campaignId, slug) in DB

2. New user clicks the link → POST /referrals/track { slug, refereeAddress }
   Backend records: refereeAddress, convertedAt = now

3. Earner requests proof → POST /referrals/proof/:campaignId (JWT authenticated)
   Backend:
     a. Looks up referral record in DB → verified and not yet claimed
     b. refereeBytes = StrKey.decodeEd25519PublicKey(refereeAddress)
     c. actionHash = SHA256(refereeBytes ‖ campaignIdBuf)             // 32 bytes
     d. earnerBytes = StrKey.decodeEd25519PublicKey(earnerAddress)    // 32 bytes
     e. timestamp = Math.floor(Date.now() / 1000)
     f. signature = oracle.signProof(campaignIdBuf, earnerBytes, actionHash, timestamp)
     g. Marks proofIssued = true in DB
     h. Returns ClaimProof as hex strings

4. Frontend builds Soroban contract invocation transaction:
     reward_vault.claim(ClaimProof { campaignId, earner, actionHash, timestamp, signature })
   Signs with Freighter → submits to Stellar RPC

5. reward_vault contract:
     a. Verifies ed25519 signature against campaign.oracle_pubkey
     b. Checks nullifier doesn't exist
     c. Writes nullifier
     d. Transfers reward_per_action * (1 - fee_rate) to earner
     e. Emits RewardClaimed event

6. NestJS events.service picks up RewardClaimed event → updates Earner.totalEarned in DB
```
