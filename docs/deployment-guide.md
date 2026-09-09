# Flare Protocol — Deployment Guide

> Covers testnet deployment for development and mainnet deployment for production.
> Read this fully before running any deployment script.

---

## Prerequisites

Install the following before proceeding:

```bash
# Rust stable + wasm32 target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Stellar CLI
cargo install --locked stellar-cli --features opt

# Verify
stellar --version   # should print stellar 0.x.x

# Node.js v20+
node --version      # >= 20.0.0

# Docker (for local infrastructure)
docker --version
docker compose version
```

---

## Testnet Deployment

### 1. Configure environment

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Edit `.env` and set:

```env
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
DEPLOYER_SECRET_KEY=<your funded testnet secret key>
```

To get a funded testnet account:
1. Generate a keypair: `stellar keys generate deployer --network testnet`
2. Fund it via Friendbot: `stellar keys fund deployer --network testnet`
3. Export the secret: `stellar keys show deployer`

### 2. Generate the oracle keypair

```bash
chmod +x scripts/generate-oracle-keypair.sh
./scripts/generate-oracle-keypair.sh
```

Copy the printed `ORACLE_PUBLIC_KEY` and `ORACLE_PRIVATE_KEY` into `backend/.env`.

> The oracle private key authorises all reward payouts. Keep it secure.
> For testnet it can live in `.env`. For mainnet, use AWS KMS — see [Mainnet section](#mainnet-deployment).

### 3. Deploy contracts

```bash
chmod +x scripts/deploy-testnet.sh
./scripts/deploy-testnet.sh
```

The script will:
1. Build all contracts to WASM (`contracts/target/wasm32-unknown-unknown/release/`)
2. Deploy `registry`, `campaign_manager`, `reward_vault` to testnet
3. Initialize each contract with the correct cross-contract addresses
4. Write the three contract IDs to `.env` and `backend/.env`

Example output:

```
[1/6] Building contracts...
      ✓ Contracts built

[2/6] Deploying Registry contract...
      ✓ Registry: CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA

[3/6] Deploying Campaign Manager contract...
      ✓ Campaign Manager: CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB

[4/6] Deploying Reward Vault contract...
      ✓ Reward Vault: CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC

[5/6] Initializing Campaign Manager...
[6/6] Initializing Reward Vault...

✅ Testnet deployment complete.
```

### 4. Start the backend

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run start:dev
# API running at http://localhost:3000
# Swagger docs at http://localhost:3000/api/docs
```

### 5. Start the frontend

```bash
cd frontend
npm install
npm start
# App running at http://localhost:4200
```

### 6. Smoke test

1. Open http://localhost:4200
2. Click **Connect Wallet** — Freighter popup should appear
3. Navigate to **Browse Campaigns** — should call `GET /campaigns` (returns empty array on fresh deploy)
4. Check backend logs for Soroban event polling messages every 5 seconds

---

## Mainnet Deployment

> ⚠️ Do not deploy to mainnet without completing the pre-mainnet checklist below.

### Pre-mainnet checklist

- [ ] All three Soroban contracts audited by a third-party security firm
- [ ] Oracle private key migrated to AWS KMS or HSM (see [Oracle Key Management](#oracle-key-management))
- [ ] Protocol treasury address is a multisig account
- [ ] Backend rate limiting and DDoS protection enabled (reverse proxy, e.g. Cloudflare)
- [ ] PostgreSQL running with automated backups
- [ ] Redis deployed with `appendonly yes` persistence
- [ ] Bug bounty program live before public announcement
- [ ] Emergency pause mechanism tested on testnet

### Oracle Key Management

For mainnet, the oracle private key must never exist in plaintext on disk.

**AWS KMS approach:**
1. Create an asymmetric KMS key (key spec: `ECC_NIST_P256` is not ed25519 — use a custom key store or use AWS KMS with a Lambda wrapper that holds the key in-memory from Secrets Manager)
2. Store the private key bytes in AWS Secrets Manager with strict IAM policies
3. Load on backend startup: replace `process.env.ORACLE_PRIVATE_KEY` with an AWS Secrets Manager fetch in `oracle.service.ts`

The `oracle.service.ts` already loads the key from environment — simply change the source.

### Deploy steps

```bash
# 1. Set network to mainnet
# Edit .env:
#   STELLAR_NETWORK=mainnet
#   STELLAR_RPC_URL=https://horizon.stellar.org  (or a dedicated RPC)
#   STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"

# 2. Fund deployer account on mainnet with XLM for fees

# 3. Deploy (uses same script, reads STELLAR_NETWORK from .env)
./scripts/deploy-testnet.sh   # (a deploy-mainnet.sh with the same logic works too)

# 4. Verify contract IDs on Stellar Explorer
# https://stellar.expert/explorer/public/contract/<CONTRACT_ID>
```

### Infrastructure recommendations

| Service | Recommendation |
|---|---|
| Backend hosting | Railway, Render, or Fly.io (Node.js support, env var secrets) |
| Frontend hosting | Vercel (static SPA) |
| PostgreSQL | Railway managed Postgres, or AWS RDS |
| Redis | Upstash (serverless Redis with persistence), or AWS ElastiCache |
| Secrets | AWS Secrets Manager or Railway environment variables |
| Monitoring | Sentry (backend errors), Datadog or Grafana (metrics) |

---

## Contract Upgrades

Soroban contracts are **not upgradeable by default**. To upgrade:

1. Deploy the new contract version — this gives a new contract ID
2. Migrate state if needed (write a migration script using `stellar contract invoke`)
3. Update `CAMPAIGN_MANAGER_CONTRACT_ID` / `REWARD_VAULT_CONTRACT_ID` etc. in `.env`
4. Restart the backend

For the `reward_vault`, any upgrade must maintain the existing nullifier map — do not wipe nullifiers on upgrade or double-claim becomes possible.

---

## Verifying a Deployment

After deployment, verify each contract is reachable:

```bash
# Check registry responds
stellar contract invoke \
  --network testnet \
  --id $REGISTRY_CONTRACT_ID \
  -- get_campaigns \
  --filter null \
  --page 0 \
  --limit 10

# Check campaign_manager responds
stellar contract invoke \
  --network testnet \
  --id $CAMPAIGN_MANAGER_CONTRACT_ID \
  -- list_active_campaigns \
  --campaign_type null \
  --page 0

# Check reward_vault balance for a non-existent campaign returns 0
stellar contract invoke \
  --network testnet \
  --id $REWARD_VAULT_CONTRACT_ID \
  -- get_balance \
  --campaign_id 0000000000000000000000000000000000000000000000000000000000000000
```

All three should return without error.

---

## Troubleshooting

**`stellar contract deploy` fails with "insufficient funds"**
The deployer account needs XLM. Fund it on testnet via `stellar keys fund deployer --network testnet`.

**Backend fails to start: `DATABASE_URL` error**
Ensure `docker compose up -d postgres` is running before starting the backend.

**`npx prisma migrate dev` fails**
Check PostgreSQL is healthy: `docker compose ps`. The default connection is `postgresql://postgres:password@localhost:5432/flare`.

**Frontend builds but campaigns don't load**
Confirm the backend is running on port 3000 and `CAMPAIGN_MANAGER_CONTRACT_ID` is set in `backend/.env`.

**Oracle signature rejected on-chain**
The `oracle_pubkey` stored in the campaign must match `ORACLE_PUBLIC_KEY` in `backend/.env`. If you regenerate the keypair after campaign creation, the campaign's oracle pubkey becomes stale — create a new campaign with the updated oracle pubkey.
