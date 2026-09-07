import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { InjectRedis } from '../common/redis.token';
import type { Redis } from 'ioredis';
import { StrKey } from '@stellar/stellar-sdk';
import { PrismaService } from '../common/prisma.service';
import { OracleService, ClaimProof } from '../oracle/oracle.service';

// ---------------------------------------------------------------------------
// Session data stored in Redis
// ---------------------------------------------------------------------------
interface AttentionSignal {
  type: 'scroll' | 'video_play' | 'video_complete' | 'heartbeat';
  value: number;
  receivedAt: number; // unix ms
}

interface AttentionSessionData {
  earnerAddress: string;
  campaignId: string;
  startTime: number; // unix ms
  signals: AttentionSignal[];
  completed: boolean;
  lastSignalAt: number; // unix ms — anti-bot: reject too-rapid signals
}

/** Anti-bot: reject signals less than 100 ms apart */
const MIN_SIGNAL_INTERVAL_MS = 100;

/** Session TTL in Redis: 2 hours */
const SESSION_TTL_SECONDS = 2 * 60 * 60;

/** Required total heartbeat duration (seconds) before session is considered complete */
const REQUIRED_ATTENTION_SECONDS = 30;

/** Rate-limit key TTL: 24 hours */
const RATE_LIMIT_TTL_SECONDS = 24 * 60 * 60;

// ---------------------------------------------------------------------------

@Injectable()
export class AttentionService {
  private readonly logger = new Logger(AttentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oracle: OracleService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Start an attention session.
   * POST /attention/start  (JWT-protected)
   */
  async startSession(
    earnerAddress: string,
    campaignId: string,
  ): Promise<{ sessionToken: string }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const sessionToken = uuidv4();
    const sessionData: AttentionSessionData = {
      earnerAddress,
      campaignId,
      startTime: Date.now(),
      signals: [],
      completed: false,
      lastSignalAt: 0,
    };

    await this.redis.set(
      this.sessionKey(sessionToken),
      JSON.stringify(sessionData),
      'EX',
      SESSION_TTL_SECONDS,
    );

    this.logger.log(
      `Attention session started: ${sessionToken} earner=${earnerAddress} campaign=${campaignId}`,
    );
    return { sessionToken };
  }

  /**
   * Record an attention signal.
   * POST /attention/signal
   */
  async recordSignal(
    sessionToken: string,
    signalType: AttentionSignal['type'],
    value: number,
  ): Promise<{ progress: number; completed: boolean }> {
    const raw = await this.redis.get(this.sessionKey(sessionToken));
    if (!raw) {
      throw new NotFoundException(`Session ${sessionToken} not found or expired`);
    }

    const session: AttentionSessionData = JSON.parse(raw) as AttentionSessionData;

    // Anti-bot: reject signals that arrive too fast
    const now = Date.now();
    if (session.lastSignalAt && now - session.lastSignalAt < MIN_SIGNAL_INTERVAL_MS) {
      throw new BadRequestException(
        'Signals arriving too fast — possible bot activity',
      );
    }

    session.signals.push({ type: signalType, value, receivedAt: now });
    session.lastSignalAt = now;

    // Determine completion
    if (!session.completed) {
      if (signalType === 'video_complete') {
        session.completed = true;
      } else {
        // Count total heartbeat coverage
        const heartbeatSeconds = session.signals.filter(
          (s) => s.type === 'heartbeat',
        ).length;
        if (heartbeatSeconds >= REQUIRED_ATTENTION_SECONDS) {
          session.completed = true;
        }
      }
    }

    // Persist updated session
    await this.redis.set(
      this.sessionKey(sessionToken),
      JSON.stringify(session),
      'EX',
      SESSION_TTL_SECONDS,
    );

    // If newly completed, write to DB
    if (session.completed) {
      const durationSeconds = Math.floor((now - session.startTime) / 1000);
      try {
        await this.prisma.attentionSession.upsert({
          where: {
            campaignId_earnerAddress: {
              campaignId: session.campaignId,
              earnerAddress: session.earnerAddress,
            },
          },
          create: {
            campaignId: session.campaignId,
            earnerAddress: session.earnerAddress,
            sessionToken,
            durationSeconds,
            completed: true,
          },
          update: {
            sessionToken,
            durationSeconds,
            completed: true,
            proofIssued: false,
          },
        });
      } catch {
        this.logger.warn(`Could not persist attention session ${sessionToken}`);
      }
    }

    const heartbeatCount = session.signals.filter(
      (s) => s.type === 'heartbeat',
    ).length;
    const progress = Math.min(
      100,
      Math.floor((heartbeatCount / REQUIRED_ATTENTION_SECONDS) * 100),
    );

    return { progress, completed: session.completed };
  }

  /**
   * Issue an oracle-signed proof once the attention threshold is met.
   * GET /attention/proof/:campaignId  (JWT-protected)
   */
  async getProof(earnerAddress: string, campaignId: string): Promise<ClaimProof> {
    // Rate limit: 1 claim per wallet per campaign per day
    const rateLimitKey = `attention:ratelimit:${campaignId}:${earnerAddress}`;
    const limited = await this.redis.get(rateLimitKey);
    if (limited) {
      throw new BadRequestException(
        'Rate limit exceeded: only 1 claim per campaign per day',
      );
    }

    const session = await this.prisma.attentionSession.findUnique({
      where: {
        campaignId_earnerAddress: { campaignId, earnerAddress },
      },
    });

    if (!session) {
      throw new NotFoundException('No attention session found for this campaign');
    }
    if (!session.completed) {
      throw new BadRequestException('Attention threshold not yet met');
    }
    if (session.proofIssued) {
      throw new BadRequestException('Proof already issued for this session');
    }

    // actionHash = SHA256(sessionToken_bytes ‖ campaignId_bytes)
    const campaignIdBuf = Buffer.from(campaignId, 'hex');
    const actionHash = createHash('sha256')
      .update(Buffer.from(session.sessionToken))
      .update(campaignIdBuf)
      .digest();

    const earnerBytes = Buffer.from(StrKey.decodeEd25519PublicKey(earnerAddress));
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.oracle.signProof(
      campaignIdBuf,
      earnerBytes,
      actionHash,
      timestamp,
    );

    await this.prisma.attentionSession.update({
      where: {
        campaignId_earnerAddress: { campaignId, earnerAddress },
      },
      data: { proofIssued: true },
    });

    // Set rate limit key for 24 hours
    await this.redis.set(rateLimitKey, '1', 'EX', RATE_LIMIT_TTL_SECONDS);

    return {
      campaignId,
      earner: earnerAddress,
      actionHash: actionHash.toString('hex'),
      timestamp,
      signature: signature.toString('hex'),
    };
  }

  // ---------------------------------------------------------------------------
  private sessionKey(token: string): string {
    return `attention:${token}`;
  }
}
