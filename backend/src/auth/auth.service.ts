import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@stellar/stellar-sdk';
import { randomBytes } from 'crypto';
import { ChallengeDto, VerifyDto } from './dto/auth.dto';

/** TTL for nonces stored in-memory (5 minutes) */
const NONCE_TTL_MS = 5 * 60 * 1000;

interface NonceRecord {
  nonce: string;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  /**
   * In-memory nonce store keyed by publicKey.
   * In production this is backed by Redis (Day 4 wires Redis in);
   * for Day 3 the in-memory store is sufficient for unit tests.
   */
  private readonly nonceStore = new Map<string, NonceRecord>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /auth/challenge
   * Generates a random nonce and stores it keyed by the caller's public key.
   * The frontend must sign this nonce with the Stellar wallet private key.
   */
  challenge(dto: ChallengeDto): { nonce: string } {
    const nonce = randomBytes(32).toString('hex');
    this.nonceStore.set(dto.publicKey, {
      nonce,
      expiresAt: Date.now() + NONCE_TTL_MS,
    });
    return { nonce };
  }

  /**
   * POST /auth/verify
   * Verifies that `signature` is a valid Stellar keypair signature of `nonce`
   * produced by the private key corresponding to `publicKey`.
   * On success returns a signed JWT.
   */
  verify(dto: VerifyDto): { accessToken: string } {
    const record = this.nonceStore.get(dto.publicKey);

    if (!record) {
      throw new UnauthorizedException('No challenge found for this public key');
    }

    if (Date.now() > record.expiresAt) {
      this.nonceStore.delete(dto.publicKey);
      throw new UnauthorizedException('Challenge nonce has expired');
    }

    if (record.nonce !== dto.nonce) {
      throw new UnauthorizedException('Nonce mismatch');
    }

    // Verify the ed25519 signature using Stellar SDK Keypair
    this.verifyStellarSignature(dto.publicKey, dto.nonce, dto.signature);

    // Consume the nonce — one-time use
    this.nonceStore.delete(dto.publicKey);

    const payload = { sub: dto.publicKey };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken };
  }

  /**
   * Verifies a Stellar ed25519 signature.
   * Stellar signs the raw UTF-8 bytes of the message.
   */
  private verifyStellarSignature(
    publicKey: string,
    message: string,
    signatureHex: string,
  ): void {
    try {
      const keypair = Keypair.fromPublicKey(publicKey);
      const messageBytes = Buffer.from(message, 'utf8');
      const signatureBytes = Buffer.from(signatureHex, 'hex');
      const valid = keypair.verify(messageBytes, signatureBytes);
      if (!valid) {
        throw new UnauthorizedException('Invalid signature');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new BadRequestException(
        `Signature verification failed: ${(err as Error).message}`,
      );
    }
  }
}
