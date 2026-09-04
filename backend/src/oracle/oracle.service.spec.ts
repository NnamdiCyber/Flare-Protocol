import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { OracleService } from './oracle.service';
import * as nacl from 'tweetnacl';
import { createHash } from 'crypto';

describe('OracleService', () => {
  let service: OracleService;
  let keypair: nacl.SignKeyPair;

  beforeEach(async () => {
    // Generate a fresh ed25519 keypair for each test
    keypair = nacl.sign.keyPair();
    const privateKeyHex = Buffer.from(keypair.secretKey).toString('hex');
    const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex');

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              oracle: {
                privateKey: privateKeyHex,
                publicKey: publicKeyHex,
              },
            }),
          ],
        }),
      ],
      providers: [OracleService],
    }).compile();

    service = module.get<OracleService>(OracleService);
    // Manually trigger onModuleInit since TestingModule does not call it by default
    service.onModuleInit();
  });

  describe('getPublicKey', () => {
    it('returns the oracle public key as hex', () => {
      const pubkey = service.getPublicKey();
      expect(pubkey).toBe(Buffer.from(keypair.publicKey).toString('hex'));
    });
  });

  describe('signProof', () => {
    it('produces a 64-byte signature', () => {
      const campaignId = Buffer.alloc(32, 0xaa);
      const earnerPubkey = Buffer.alloc(32, 0xbb);
      const actionHash = Buffer.alloc(32, 0xcc);
      const timestamp = 1700000000;

      const sig = service.signProof(campaignId, earnerPubkey, actionHash, timestamp);
      expect(sig).toHaveLength(64);
    });

    it('produces a deterministic signature for identical inputs', () => {
      const campaignId = Buffer.alloc(32, 0x01);
      const earnerPubkey = Buffer.alloc(32, 0x02);
      const actionHash = Buffer.alloc(32, 0x03);
      const timestamp = 1700000000;

      const sig1 = service.signProof(campaignId, earnerPubkey, actionHash, timestamp);
      const sig2 = service.signProof(campaignId, earnerPubkey, actionHash, timestamp);
      expect(sig1.toString('hex')).toBe(sig2.toString('hex'));
    });

    it('produces different signatures for different inputs', () => {
      const campaignId = Buffer.alloc(32, 0x01);
      const earnerPubkey = Buffer.alloc(32, 0x02);
      const actionHash1 = Buffer.alloc(32, 0x03);
      const actionHash2 = Buffer.alloc(32, 0x04);
      const timestamp = 1700000000;

      const sig1 = service.signProof(campaignId, earnerPubkey, actionHash1, timestamp);
      const sig2 = service.signProof(campaignId, earnerPubkey, actionHash2, timestamp);
      expect(sig1.toString('hex')).not.toBe(sig2.toString('hex'));
    });
  });

  describe('verifyProof', () => {
    it('verifies a valid signature produced by signProof', () => {
      const campaignId = Buffer.alloc(32, 0xde);
      const earnerPubkey = Buffer.alloc(32, 0xad);
      const actionHash = Buffer.alloc(32, 0xbe);
      const timestamp = 1700000000;

      const signature = service.signProof(campaignId, earnerPubkey, actionHash, timestamp);
      const valid = service.verifyProof(campaignId, earnerPubkey, actionHash, timestamp, signature);
      expect(valid).toBe(true);
    });

    it('rejects a tampered signature', () => {
      const campaignId = Buffer.alloc(32, 0x01);
      const earnerPubkey = Buffer.alloc(32, 0x02);
      const actionHash = Buffer.alloc(32, 0x03);
      const timestamp = 1700000000;

      const signature = service.signProof(campaignId, earnerPubkey, actionHash, timestamp);
      // Flip one byte
      const tampered = Buffer.from(signature);
      tampered[0] ^= 0xff;

      const valid = service.verifyProof(campaignId, earnerPubkey, actionHash, timestamp, tampered);
      expect(valid).toBe(false);
    });

    it('rejects a signature for a different timestamp', () => {
      const campaignId = Buffer.alloc(32, 0x01);
      const earnerPubkey = Buffer.alloc(32, 0x02);
      const actionHash = Buffer.alloc(32, 0x03);

      const sig = service.signProof(campaignId, earnerPubkey, actionHash, 1700000000);
      const valid = service.verifyProof(campaignId, earnerPubkey, actionHash, 9999999999, sig);
      expect(valid).toBe(false);
    });
  });

  describe('buildMessage', () => {
    it('constructs SHA256(campaign_id ‖ earner_pubkey ‖ action_hash ‖ timestamp_le8)', () => {
      const campaignId = Buffer.alloc(32, 0x01);
      const earnerPubkey = Buffer.alloc(32, 0x02);
      const actionHash = Buffer.alloc(32, 0x03);
      const timestamp = 1700000000;

      const tsBuf = Buffer.allocUnsafe(8);
      tsBuf.writeBigUInt64LE(BigInt(timestamp));

      const expected = createHash('sha256')
        .update(Buffer.concat([campaignId, earnerPubkey, actionHash, tsBuf]))
        .digest();

      const result = service.buildMessage(campaignId, earnerPubkey, actionHash, timestamp);
      expect(Buffer.from(result).toString('hex')).toBe(expected.toString('hex'));
    });
  });
});
