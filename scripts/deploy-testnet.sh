#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-testnet.sh
#
# Deploys all three Flare Protocol Soroban contracts to Stellar testnet.
#
# Steps:
#   1. Build all contracts to WASM (release profile)
#   2. Deploy Registry contract
#   3. Deploy Campaign Manager contract
#   4. Deploy Reward Vault contract
#   5. Initialize Campaign Manager with Registry + Reward Vault addresses
#   6. Initialize Reward Vault with Campaign Manager address + fee rate
#   7. Print all contract IDs and write them to .env
#
# Prerequisites:
#   - stellar CLI installed (cargo install --locked stellar-cli --features opt)
#   - DEPLOYER_SECRET_KEY set in .env (a funded testnet account)
#   - Rust + wasm32-unknown-unknown target installed
#
# Usage:
#   chmod +x scripts/deploy-testnet.sh
#   ./scripts/deploy-testnet.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."

# ── Load environment ──────────────────────────────────────────────────────────
ENV_FILE="$ROOT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

: "${DEPLOYER_SECRET_KEY:?'DEPLOYER_SECRET_KEY must be set in .env'}"
: "${STELLAR_NETWORK:=testnet}"
: "${STELLAR_RPC_URL:=https://soroban-testnet.stellar.org}"
: "${STELLAR_NETWORK_PASSPHRASE:=Test SDF Network ; September 2015}"

STELLAR="stellar"
NETWORK_FLAGS="--network testnet --source-account $DEPLOYER_SECRET_KEY"

echo "═══════════════════════════════════════════════════════"
echo " Flare Protocol — Testnet Deployment"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Step 1: Build contracts ───────────────────────────────────────────────────
echo "[1/6] Building contracts..."
cd "$ROOT_DIR/contracts"
cargo build --target wasm32-unknown-unknown --release --quiet
echo "      ✓ Contracts built"
echo ""

WASM_DIR="$ROOT_DIR/contracts/target/wasm32-unknown-unknown/release"

# ── Step 2: Deploy Registry ───────────────────────────────────────────────────
echo "[2/6] Deploying Registry contract..."
REGISTRY_ID=$($STELLAR contract deploy \
  $NETWORK_FLAGS \
  --wasm "$WASM_DIR/registry.wasm" \
  2>&1 | tail -n1)
echo "      ✓ Registry: $REGISTRY_ID"
echo ""

# ── Step 3: Deploy Campaign Manager ──────────────────────────────────────────
echo "[3/6] Deploying Campaign Manager contract..."
CAMPAIGN_MANAGER_ID=$($STELLAR contract deploy \
  $NETWORK_FLAGS \
  --wasm "$WASM_DIR/campaign_manager.wasm" \
  2>&1 | tail -n1)
echo "      ✓ Campaign Manager: $CAMPAIGN_MANAGER_ID"
echo ""

# ── Step 4: Deploy Reward Vault ───────────────────────────────────────────────
echo "[4/6] Deploying Reward Vault contract..."
REWARD_VAULT_ID=$($STELLAR contract deploy \
  $NETWORK_FLAGS \
  --wasm "$WASM_DIR/reward_vault.wasm" \
  2>&1 | tail -n1)
echo "      ✓ Reward Vault: $REWARD_VAULT_ID"
echo ""

# ── Step 5: Initialize Campaign Manager ──────────────────────────────────────
echo "[5/6] Initializing Campaign Manager (registry + vault addresses)..."
$STELLAR contract invoke \
  $NETWORK_FLAGS \
  --id "$CAMPAIGN_MANAGER_ID" \
  -- initialize \
  --registry_address "$REGISTRY_ID" \
  --vault_address "$REWARD_VAULT_ID"
echo "      ✓ Campaign Manager initialized"
echo ""

# ── Step 6: Initialize Reward Vault ──────────────────────────────────────────
echo "[6/6] Initializing Reward Vault (campaign_manager address + fee_rate=0)..."
$STELLAR contract invoke \
  $NETWORK_FLAGS \
  --id "$REWARD_VAULT_ID" \
  -- initialize \
  --campaign_manager "$CAMPAIGN_MANAGER_ID" \
  --fee_rate 0 \
  --treasury "$($STELLAR keys address "$DEPLOYER_SECRET_KEY" 2>/dev/null || echo $DEPLOYER_SECRET_KEY)"
echo "      ✓ Reward Vault initialized"
echo ""

# ── Write contract IDs to .env ────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════"
echo " Contract Addresses"
echo "═══════════════════════════════════════════════════════"
echo " REGISTRY_CONTRACT_ID=$REGISTRY_ID"
echo " CAMPAIGN_MANAGER_CONTRACT_ID=$CAMPAIGN_MANAGER_ID"
echo " REWARD_VAULT_CONTRACT_ID=$REWARD_VAULT_ID"
echo ""

# Update .env in root and backend
for ENV_TARGET in "$ROOT_DIR/.env" "$ROOT_DIR/backend/.env"; do
  if [ -f "$ENV_TARGET" ]; then
    # Replace existing values
    sed -i "s|^REGISTRY_CONTRACT_ID=.*|REGISTRY_CONTRACT_ID=$REGISTRY_ID|" "$ENV_TARGET"
    sed -i "s|^CAMPAIGN_MANAGER_CONTRACT_ID=.*|CAMPAIGN_MANAGER_CONTRACT_ID=$CAMPAIGN_MANAGER_ID|" "$ENV_TARGET"
    sed -i "s|^REWARD_VAULT_CONTRACT_ID=.*|REWARD_VAULT_CONTRACT_ID=$REWARD_VAULT_ID|" "$ENV_TARGET"
    echo "Updated $ENV_TARGET"
  fi
done

echo ""
echo "✅ Testnet deployment complete."
