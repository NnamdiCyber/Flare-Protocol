import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('challenge', () => {
    it('returns a nonce for a valid public key', () => {
      const keypair = Keypair.random();
      const result = service.challenge({ publicKey: keypair.publicKey() });

      expect(result).toHaveProperty('nonce');
      expect(typeof result.nonce).toBe('string');
      expect(result.nonce).toHaveLength(64); // 32 bytes hex
    });

    it('returns a different nonce on each call', () => {
      const keypair = Keypair.random();
      const r1 = service.challenge({ publicKey: keypair.publicKey() });
      const r2 = service.challenge({ publicKey: keypair.publicKey() });
      expect(r1.nonce).not.toBe(r2.nonce);
    });
  });

  describe('verify', () => {
    it('issues a JWT when signature is valid', () => {
      const keypair = Keypair.random();
      const { nonce } = service.challenge({ publicKey: keypair.publicKey() });

      // Sign the nonce with the Stellar keypair
      const signatureBytes = keypair.sign(Buffer.from(nonce, 'utf8'));
      const signatureHex = Buffer.from(signatureBytes).toString('hex');

      const result = service.verify({
        publicKey: keypair.publicKey(),
        nonce,
        signature: signatureHex,
      });

      expect(result).toHaveProperty('accessToken');
      expect(typeof result.accessToken).toBe('string');
    });

    it('throws UnauthorizedException for wrong signature', () => {
      const keypair = Keypair.random();
      const { nonce } = service.challenge({ publicKey: keypair.publicKey() });

      // Sign with a DIFFERENT keypair
      const wrongKeypair = Keypair.random();
      const signatureBytes = wrongKeypair.sign(Buffer.from(nonce, 'utf8'));
      const signatureHex = Buffer.from(signatureBytes).toString('hex');

      expect(() =>
        service.verify({
          publicKey: keypair.publicKey(),
          nonce,
          signature: signatureHex,
        }),
      ).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when no challenge exists', () => {
      const keypair = Keypair.random();
      expect(() =>
        service.verify({
          publicKey: keypair.publicKey(),
          nonce: 'nonexistent',
          signature: 'aabb',
        }),
      ).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when nonce does not match', () => {
      const keypair = Keypair.random();
      service.challenge({ publicKey: keypair.publicKey() });

      expect(() =>
        service.verify({
          publicKey: keypair.publicKey(),
          nonce: 'wrong-nonce',
          signature: '0'.repeat(128),
        }),
      ).toThrow(UnauthorizedException);
    });

    it('nonce is consumed after successful verification (one-time use)', () => {
      const keypair = Keypair.random();
      const { nonce } = service.challenge({ publicKey: keypair.publicKey() });

      const signatureBytes = keypair.sign(Buffer.from(nonce, 'utf8'));
      const signatureHex = Buffer.from(signatureBytes).toString('hex');

      // First verify succeeds
      service.verify({ publicKey: keypair.publicKey(), nonce, signature: signatureHex });

      // Second verify with same nonce must fail
      expect(() =>
        service.verify({ publicKey: keypair.publicKey(), nonce, signature: signatureHex }),
      ).toThrow(UnauthorizedException);
    });
  });
});
