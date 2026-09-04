import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as nacl from 'tweetnacl';

export interface ClaimProof {
  campaignId: string;    // hex
  earner: string;        // Stellar public key (G...)
  actionHash: string;    // hex (32 bytes)
  timestamp: number;     // unix seconds
  signature: string;     // hex (64 bytes)
}

@Injectable()
export class OracleService implements OnModuleInit {
  private readonly logger = new Logger(OracleService.name);
  private privateKey!: Uint8Array;  // 64 bytes (seed + public key, tweetnacl format)
  private publicKey!: Uint8Array;   // 32 bytes

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const privHex = this.config.get<string>('oracle.privateKey');
    const pubHex = this.config.get<string>('oracle.publicKey');

    if (privHex && pubHex) {
      // tweetnacl sign keypair: privateKey is 64 bytes (seed || publicKey)
      this.privateKey = Buffer.from(privHex, 'hex');
      this.publicKey = Buffer.from(pubHex, 'hex');

      if (this.privateKey.length !== 64) {
        this.logger.warn(
          'ORACLE_PRIVATE_KEY must be 64 bytes (128 hex chars). ' +
          'Generate with scripts/generate-oracle-keypair.sh',
        );
      }
      this.logger.log(
        `Oracle loaded — pubkey: ${pubHex.slice(0, 16)}...`,
      );
    } else {
      this.logger.warn(
        'ORACLE_PUBLIC_KEY / ORACLE_PRIVATE_KEY not set — ' +
        'oracle signing disabled. Run scripts/generate-oracle-keypair.sh.',
      );
    }
  }

  /**
   * Returns the oracle public key as hex.
   * Each campaign stores this on-chain as oracle_pubkey.
   */
  getPublicKey(): string {
    return Buffer.from(this.publicKey ?? new Uint8Array(32)).toString('hex');
  }

  /**
   * Constructs the proof message and signs it with the oracle ed25519 key.
   *
   * Message: SHA256(campaign_id ‖ earner_pubkey ‖ action_hash ‖ timestamp_le_8bytes)
   *
   * This MUST match the verify logic in reward_vault/src/verify.rs:
   *   SHA256(campaign_id || earner_pubkey || action_hash || timestamp.to_le_bytes())
   *
   * @param campaignId  32-byte campaign ID buffer
   * @param earnerPubkey 32-byte earner Stellar public key (raw bytes, not G-address)
   * @param actionHash  32-byte action-specific hash
   * @param timestamp   Unix timestamp in seconds
   */
  signProof(
    campaignId: Buffer,
    earnerPubkey: Buffer,
    actionHash: Buffer,
    timestamp: number,
  ): Buffer {
    if (!this.privateKey) {
      throw new Error('Oracle private key not loaded');
    }

    const message = this.buildMessage(campaignId, earnerPubkey, actionHash, timestamp);
    const signatureBytes = nacl.sign.detached(message, this.privateKey);
    return Buffer.from(signatureBytes);
  }

  /**
   * Verifies an oracle proof signature — used internally before returning proofs
   * to callers, and in unit tests.
   */
  verifyProof(
    campaignId: Buffer,
    earnerPubkey: Buffer,
    actionHash: Buffer,
    timestamp: number,
    signature: Buffer,
  ): boolean {
    if (!this.publicKey) return false;
    const message = this.buildMessage(campaignId, earnerPubkey, actionHash, timestamp);
    return nacl.sign.detached.verify(message, signature, this.publicKey);
  }

  /**
   * Builds the SHA256 message matching the Soroban reward_vault verify.rs.
   * Layout: SHA256(campaign_id[32] ‖ earner_pubkey[32] ‖ action_hash[32] ‖ timestamp[8 LE])
   */
  buildMessage(
    campaignId: Buffer,
    earnerPubkey: Buffer,
    actionHash: Buffer,
    timestamp: number,
  ): Uint8Array {
    // Encode timestamp as 8-byte little-endian (u64)
    const tsBuf = Buffer.allocUnsafe(8);
    // JavaScript numbers are safe for unix timestamps (< 2^53)
    tsBuf.writeBigUInt64LE(BigInt(timestamp));

    const preimage = Buffer.concat([
      campaignId,
      earnerPubkey,
      actionHash,
      tsBuf,
    ]);

    return createHash('sha256').update(preimage).digest();
  }
}
