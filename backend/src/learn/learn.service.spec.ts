import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { LearnService } from './learn.service';
import { PrismaService } from '../common/prisma.service';
import { OracleService } from '../oracle/oracle.service';
import { Keypair } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CAMPAIGN_ID = 'c'.repeat(64);

function makePubkey(): string {
  return Keypair.random().publicKey();
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
function makePrismaMock() {
  return {
    learnAnswerKey: { findUnique: jest.fn() },
    learnSubmission: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeOracleMock() {
  return { signProof: jest.fn().mockReturnValue(Buffer.alloc(64, 0xcc)) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('LearnService', () => {
  let service: LearnService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let oracle: ReturnType<typeof makeOracleMock>;

  const earner = makePubkey();

  // Answer key: 3 questions, pass threshold 80%
  const answerKey = {
    campaignId: CAMPAIGN_ID,
    answers: { q1: 'A', q2: 'B', q3: 'C', q4: 'D', q5: 'E' },
    passThreshold: 80,
  };

  beforeEach(async () => {
    prisma = makePrismaMock();
    oracle = makeOracleMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LearnService,
        { provide: PrismaService, useValue: prisma },
        { provide: OracleService, useValue: oracle },
      ],
    }).compile();

    service = module.get<LearnService>(LearnService);
  });

  // -------------------------------------------------------------------------
  describe('submitAnswers', () => {
    it('passes when score meets the threshold (5/5 = 100%)', async () => {
      prisma.learnAnswerKey.findUnique.mockResolvedValue(answerKey);
      prisma.learnSubmission.upsert.mockResolvedValue({});

      const result = await service.submitAnswers(
        earner, CAMPAIGN_ID,
        { q1: 'A', q2: 'B', q3: 'C', q4: 'D', q5: 'E' },
      );

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it('passes when score exactly meets the threshold (4/5 = 80%)', async () => {
      prisma.learnAnswerKey.findUnique.mockResolvedValue(answerKey);
      prisma.learnSubmission.upsert.mockResolvedValue({});

      const result = await service.submitAnswers(
        earner, CAMPAIGN_ID,
        { q1: 'A', q2: 'B', q3: 'C', q4: 'D', q5: 'WRONG' },
      );

      expect(result.passed).toBe(true);
      expect(result.score).toBe(80);
    });

    it('fails when score is below the threshold (3/5 = 60%)', async () => {
      prisma.learnAnswerKey.findUnique.mockResolvedValue(answerKey);
      prisma.learnSubmission.upsert.mockResolvedValue({});

      const result = await service.submitAnswers(
        earner, CAMPAIGN_ID,
        { q1: 'A', q2: 'B', q3: 'C', q4: 'WRONG', q5: 'WRONG' },
      );

      expect(result.passed).toBe(false);
      expect(result.score).toBe(60);
    });

    it('grading is case-insensitive', async () => {
      prisma.learnAnswerKey.findUnique.mockResolvedValue(answerKey);
      prisma.learnSubmission.upsert.mockResolvedValue({});

      const result = await service.submitAnswers(
        earner, CAMPAIGN_ID,
        { q1: 'a', q2: 'b', q3: 'c', q4: 'd', q5: 'e' },
      );

      expect(result.passed).toBe(true);
    });

    it('throws NotFoundException when no answer key exists', async () => {
      prisma.learnAnswerKey.findUnique.mockResolvedValue(null);
      await expect(
        service.submitAnswers(earner, CAMPAIGN_ID, { q1: 'A' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  describe('getProof', () => {
    it('issues oracle-signed proof for a passing submission', async () => {
      prisma.learnSubmission.findUnique.mockResolvedValue({
        score: 100,
        passed: true,
        proofIssued: false,
      });
      prisma.learnSubmission.update.mockResolvedValue({});

      const proof = await service.getProof(earner, CAMPAIGN_ID);

      expect(proof.campaignId).toBe(CAMPAIGN_ID);
      expect(proof.earner).toBe(earner);
      expect(proof.signature).toHaveLength(128);
      expect(oracle.signProof).toHaveBeenCalledTimes(1);
      expect(prisma.learnSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { proofIssued: true } }),
      );
    });

    it('throws NotFoundException when no submission exists', async () => {
      prisma.learnSubmission.findUnique.mockResolvedValue(null);
      await expect(service.getProof(earner, CAMPAIGN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when submission did not pass', async () => {
      prisma.learnSubmission.findUnique.mockResolvedValue({
        score: 60,
        passed: false,
        proofIssued: false,
      });
      await expect(service.getProof(earner, CAMPAIGN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when proof already issued', async () => {
      prisma.learnSubmission.findUnique.mockResolvedValue({
        score: 100,
        passed: true,
        proofIssued: true,
      });
      await expect(service.getProof(earner, CAMPAIGN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
