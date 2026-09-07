import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SocialService } from './social.service';
import { PrismaService } from '../common/prisma.service';
import { OracleService } from '../oracle/oracle.service';
import { TwitterProvider } from './providers/twitter.provider';
import { Keypair } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CAMPAIGN_ID = 'b'.repeat(64);
const POST_URL = 'https://twitter.com/testuser/status/1234567890';

function makePubkey(): string {
  return Keypair.random().publicKey();
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
function makePrismaMock() {
  return {
    campaign: { findUnique: jest.fn() },
    socialVerification: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeOracleMock() {
  return { signProof: jest.fn().mockReturnValue(Buffer.alloc(64, 0xbb)) };
}

function makeTwitterMock() {
  return {
    extractPostId: jest.fn().mockReturnValue('1234567890'),
    extractUsername: jest.fn().mockReturnValue('testuser'),
    getPost: jest.fn().mockResolvedValue({
      id: '1234567890',
      text: 'Some tweet text #flare',
      authorId: 'uid1',
    }),
    getAccountInfo: jest.fn().mockResolvedValue({
      id: 'uid1',
      username: 'testuser',
      name: 'Test User',
      createdAt: new Date(Date.now() - 60 * 86400_000).toISOString(), // 60 days old
      followersCount: 100,
      tweetCount: 50,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SocialService', () => {
  let service: SocialService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let oracle: ReturnType<typeof makeOracleMock>;
  let twitter: ReturnType<typeof makeTwitterMock>;

  const earner = makePubkey();

  beforeEach(async () => {
    prisma = makePrismaMock();
    oracle = makeOracleMock();
    twitter = makeTwitterMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: PrismaService, useValue: prisma },
        { provide: OracleService, useValue: oracle },
        { provide: TwitterProvider, useValue: twitter },
      ],
    }).compile();

    service = module.get<SocialService>(SocialService);
  });

  // -------------------------------------------------------------------------
  describe('verifySocialPost', () => {
    it('returns verified=true for a valid post', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ campaignId: CAMPAIGN_ID });
      prisma.socialVerification.upsert.mockResolvedValue({});

      const result = await service.verifySocialPost(
        POST_URL, earner, CAMPAIGN_ID, 'twitter',
      );

      expect(result.verified).toBe(true);
      expect(prisma.socialVerification.upsert).toHaveBeenCalledTimes(1);
    });

    it('returns verified=false for unsupported platform', async () => {
      const result = await service.verifySocialPost(
        POST_URL, earner, CAMPAIGN_ID, 'instagram',
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toMatch(/not supported/i);
    });

    it('returns verified=false when tweet is not found', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ campaignId: CAMPAIGN_ID });
      twitter.getPost.mockResolvedValue(null);

      const result = await service.verifySocialPost(
        POST_URL, earner, CAMPAIGN_ID, 'twitter',
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toMatch(/not found/i);
    });

    it('returns verified=false when account is too new (anti-fraud)', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ campaignId: CAMPAIGN_ID });
      twitter.getAccountInfo.mockResolvedValue({
        id: 'uid1',
        username: 'newuser',
        name: 'New User',
        createdAt: new Date(Date.now() - 5 * 86400_000).toISOString(), // only 5 days old
        followersCount: 100,
        tweetCount: 5,
      });

      const result = await service.verifySocialPost(
        POST_URL, earner, CAMPAIGN_ID, 'twitter',
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toMatch(/days old/i);
    });

    it('returns verified=false when follower count is too low (anti-fraud)', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ campaignId: CAMPAIGN_ID });
      twitter.getAccountInfo.mockResolvedValue({
        id: 'uid1',
        username: 'testuser',
        name: 'Test User',
        createdAt: new Date(Date.now() - 60 * 86400_000).toISOString(),
        followersCount: 2,
        tweetCount: 5,
      });

      const result = await service.verifySocialPost(
        POST_URL, earner, CAMPAIGN_ID, 'twitter',
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toMatch(/followers/i);
    });

    it('throws NotFoundException for unknown campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);
      await expect(
        service.verifySocialPost(POST_URL, earner, CAMPAIGN_ID, 'twitter'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  describe('getProof', () => {
    it('issues an oracle-signed proof for a verified post', async () => {
      prisma.socialVerification.findUnique.mockResolvedValue({
        postUrl: POST_URL,
        verifiedAt: new Date(),
        proofIssued: false,
      });
      prisma.socialVerification.update.mockResolvedValue({});

      const proof = await service.getProof(earner, CAMPAIGN_ID);

      expect(proof.campaignId).toBe(CAMPAIGN_ID);
      expect(proof.earner).toBe(earner);
      expect(proof.signature).toHaveLength(128);
      expect(oracle.signProof).toHaveBeenCalledTimes(1);
      expect(prisma.socialVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { proofIssued: true } }),
      );
    });

    it('throws NotFoundException when no verification record exists', async () => {
      prisma.socialVerification.findUnique.mockResolvedValue(null);
      await expect(service.getProof(earner, CAMPAIGN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when proof already issued', async () => {
      prisma.socialVerification.findUnique.mockResolvedValue({
        postUrl: POST_URL,
        verifiedAt: new Date(),
        proofIssued: true,
      });
      await expect(service.getProof(earner, CAMPAIGN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
