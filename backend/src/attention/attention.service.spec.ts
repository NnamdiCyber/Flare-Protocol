import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AttentionService } from './attention.service';
import { PrismaService } from '../common/prisma.service';
import { OracleService } from '../oracle/oracle.service';
import { REDIS_TOKEN } from '../common/redis.token';
import { Keypair } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
const CAMPAIGN_ID = 'd'.repeat(64);
const SESSION_TOKEN = 'test-session-uuid';

function makePubkey(): string {
  return Keypair.random().publicKey();
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
function makePrismaMock() {
  return {
    campaign: { findUnique: jest.fn() },
    attentionSession: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeOracleMock() {
  return { signProof: jest.fn().mockReturnValue(Buffer.alloc(64, 0xdd)) };
}

/** Build an in-memory Redis stub with the subset of operations used by AttentionService */
function makeRedisMock() {
  const store = new Map<string, { value: string; ttl: number }>();
  return {
    get: jest.fn(async (key: string) => {
      const entry = store.get(key);
      return entry ? entry.value : null;
    }),
    set: jest.fn(async (key: string, value: string, _ex?: string, _ttl?: number) => {
      store.set(key, { value, ttl: _ttl ?? 0 });
      return 'OK';
    }),
    _store: store, // for test inspection
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AttentionService', () => {
  let service: AttentionService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let oracle: ReturnType<typeof makeOracleMock>;
  let redis: ReturnType<typeof makeRedisMock>;

  const earner = makePubkey();

  beforeEach(async () => {
    prisma = makePrismaMock();
    oracle = makeOracleMock();
    redis = makeRedisMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttentionService,
        { provide: PrismaService, useValue: prisma },
        { provide: OracleService, useValue: oracle },
        { provide: REDIS_TOKEN, useValue: redis },
      ],
    }).compile();

    service = module.get<AttentionService>(AttentionService);
  });

  // -------------------------------------------------------------------------
  describe('startSession', () => {
    it('creates a session and returns a token', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ campaignId: CAMPAIGN_ID });

      const result = await service.startSession(earner, CAMPAIGN_ID);

      expect(result.sessionToken).toBeDefined();
      expect(typeof result.sessionToken).toBe('string');
      expect(redis.set).toHaveBeenCalledTimes(1);

      // Session should be stored in Redis
      const [key, rawValue] = (redis.set as jest.Mock).mock.calls[0] as [string, string, ...unknown[]];
      expect(key).toContain('attention:');
      const session = JSON.parse(rawValue) as { earnerAddress: string; campaignId: string; completed: boolean };
      expect(session.earnerAddress).toBe(earner);
      expect(session.campaignId).toBe(CAMPAIGN_ID);
      expect(session.completed).toBe(false);
    });

    it('throws NotFoundException for unknown campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);
      await expect(service.startSession(earner, CAMPAIGN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('recordSignal', () => {
    const makeStoredSession = (completed = false) =>
      JSON.stringify({
        earnerAddress: earner,
        campaignId: CAMPAIGN_ID,
        startTime: Date.now() - 5000,
        signals: [],
        completed,
        lastSignalAt: 0,
      });

    it('records a heartbeat signal and returns progress', async () => {
      redis.get.mockResolvedValue(makeStoredSession());
      prisma.attentionSession.upsert.mockResolvedValue({});

      const result = await service.recordSignal(SESSION_TOKEN, 'heartbeat', 1);

      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.completed).toBe(false);
    });

    it('marks session completed on video_complete signal', async () => {
      redis.get.mockResolvedValue(makeStoredSession());
      prisma.attentionSession.upsert.mockResolvedValue({});

      const result = await service.recordSignal(SESSION_TOKEN, 'video_complete', 1);

      expect(result.completed).toBe(true);
      expect(prisma.attentionSession.upsert).toHaveBeenCalledTimes(1);
    });

    it('marks completed after 30 heartbeat signals', async () => {
      // Pre-load 29 heartbeat signals
      const session = JSON.parse(makeStoredSession()) as {
        signals: Array<{ type: string; value: number; receivedAt: number }>;
        lastSignalAt: number;
      };
      for (let i = 0; i < 29; i++) {
        session.signals.push({ type: 'heartbeat', value: 1, receivedAt: Date.now() - (29 - i) * 1000 });
      }
      session.lastSignalAt = Date.now() - 1000; // last signal 1 second ago
      redis.get.mockResolvedValue(JSON.stringify(session));
      prisma.attentionSession.upsert.mockResolvedValue({});

      const result = await service.recordSignal(SESSION_TOKEN, 'heartbeat', 1);

      expect(result.completed).toBe(true);
    });

    it('throws NotFoundException when session is missing from Redis', async () => {
      redis.get.mockResolvedValue(null);
      await expect(
        service.recordSignal('bad-token', 'heartbeat', 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for bot-like rapid signals', async () => {
      const session = JSON.parse(makeStoredSession()) as { lastSignalAt: number };
      session.lastSignalAt = Date.now(); // last signal just now
      redis.get.mockResolvedValue(JSON.stringify(session));

      await expect(
        service.recordSignal(SESSION_TOKEN, 'heartbeat', 1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  describe('getProof', () => {
    it('issues an oracle-signed proof for a completed session', async () => {
      // No rate limit key
      redis.get.mockResolvedValue(null);
      prisma.attentionSession.findUnique.mockResolvedValue({
        sessionToken: SESSION_TOKEN,
        completed: true,
        proofIssued: false,
      });
      prisma.attentionSession.update.mockResolvedValue({});

      const proof = await service.getProof(earner, CAMPAIGN_ID);

      expect(proof.campaignId).toBe(CAMPAIGN_ID);
      expect(proof.earner).toBe(earner);
      expect(proof.signature).toHaveLength(128);
      expect(oracle.signProof).toHaveBeenCalledTimes(1);
      expect(prisma.attentionSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { proofIssued: true } }),
      );
    });

    it('throws BadRequestException when rate-limited', async () => {
      redis.get.mockResolvedValue('1'); // rate limit key present

      await expect(service.getProof(earner, CAMPAIGN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when no session exists', async () => {
      redis.get.mockResolvedValue(null);
      prisma.attentionSession.findUnique.mockResolvedValue(null);

      await expect(service.getProof(earner, CAMPAIGN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when session not yet completed', async () => {
      redis.get.mockResolvedValue(null);
      prisma.attentionSession.findUnique.mockResolvedValue({
        sessionToken: SESSION_TOKEN,
        completed: false,
        proofIssued: false,
      });

      await expect(service.getProof(earner, CAMPAIGN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
