#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# generate-oracle-keypair.sh
#
# Generates a random ed25519 keypair for the Flare Protocol oracle backend.
# The oracle uses this keypair to sign action proofs that the Soroban
# reward_vault contract verifies on-chain.
#
# Usage:
#   chmod +x scripts/generate-oracle-keypair.sh
#   ./scripts/generate-oracle-keypair.sh
#
# Output:
#   ORACLE_PUBLIC_KEY=<64-char hex>
#   ORACLE_PRIVATE_KEY=<128-char hex>
#
# ⚠️  WARNING: Store ORACLE_PRIVATE_KEY securely.
#              In production use an HSM or AWS KMS — never commit it to git.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Ensure Node.js is available
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required. Install it from https://nodejs.org" >&2
  exit 1
fi

# Ensure tweetnacl is available (it is a backend dependency)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend"

if [ ! -d "$BACKEND_DIR/node_modules/tweetnacl" ]; then
  echo "Error: tweetnacl not found. Run 'npm install' in the backend/ directory first." >&2
  exit 1
fi

# Generate the keypair using Node.js + tweetnacl
node -e "
const nacl = require('$BACKEND_DIR/node_modules/tweetnacl');

const keypair = nacl.sign.keyPair();

// ed25519 public key  = first 32 bytes of the 64-byte public key
const publicKeyHex  = Buffer.from(keypair.publicKey).toString('hex');

// ed25519 private key = full 64-byte secretKey (seed || publicKey)
const privateKeyHex = Buffer.from(keypair.secretKey).toString('hex');

console.log('ORACLE_PUBLIC_KEY='  + publicKeyHex);
console.log('ORACLE_PRIVATE_KEY=' + privateKeyHex);
console.log('');
console.log('# Add the above lines to backend/.env');
console.log('# ⚠️  WARNING: Store ORACLE_PRIVATE_KEY securely. Never commit it to git.');
"
