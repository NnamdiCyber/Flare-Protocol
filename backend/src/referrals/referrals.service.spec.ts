import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { OracleService } from '../oracle/oracle.service';
import { PrismaService } from '../common/prisma.service';
import { Keypair } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CAMPAIGN_ID = 'a'.repeat(64); // 32-byte hex

/** Generate a real Stellar keypair so StrKey.decodeEd25519PublicKey works */
function makePubkey(): string {
  return Keypair.random().publicKey();
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
function makePrismaMock() {
  return {
    campaign: {
      findUnique: jest.fn(),
    },
    referral: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeOracleMock() {
  return {
    signProof: jest.fn().mockReturnValue(Buffer.alloc(64, 0xaa)),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ReferralsService', () => {
  let service: ReferralsService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let oracle: ReturnType<typeof makeOracleMock>;

  const earner = makePubkey();
  const referee = makePubkey();

  beforeEach(async () => {
    prisma = makePrismaMock();
    oracle = makeOracleMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OracleService, useValue: oracle },
      ],
    }).compile();

    service = module.get<ReferralsService>(ReferralsService);
  });

  // -------------------------------------------------------------------------
  describe('generateLink', () => {
    it('creates a new referral link and returns it', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ campaignId: CAMPAIGN_ID });
      prisma.referral.findFirst.mockResolvedValue(null);
      prisma.referral.create.mockResolvedValue({ slug: 'test-slug' });

      const result = await service.generateLink(earner, CAMPAIGN_ID);

      expect(result.referralLink).toMatch(/\/r\//);
      expect(prisma.referral.create).toHaveBeenCalledTimes(1);
    });

    it('returns existing link if one already exists (idempotent)', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ campaignId: CAMPAIGN_ID });
      prisma.referral.findFirst.mockResolvedValue({ slug: 'existing-slug' });

      const result = await service.generateLink(earner, CAMPAIGN_ID);

      expect(result.referralLink).toContain('existing-slug');
      expect(prisma.referral.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.generateLink(earner, CAMPAIGN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('trackConversion', () => {
    it('records a conversion successfully', async () => {
      prisma.referral.findUnique.mockResolvedValue({
        slug: 'slug1',
        referrerAddress: earner,
        refereeAddress: null,
      });
      prisma.referral.update.mockResolvedValue({});

      const result = await service.trackConversion('slug1', referee);

      expect(result.success).toBe(true);
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'slug1' } }),
      );
    });

    it('is idempotent when already converted', async () => {
      prisma.referral.findUnique.mockResolvedValue({
        slug: 'slug1',
        referrerAddress: earner,
        refereeAddress: referee,
      });

      const result = await service.trackConversion('slug1', referee);
      expect(result.success).toBe(true);
      expect(prisma.referral.update).not.toHaveBeenCalled();
    });

    it('throws when slug not found', async () => {
      prisma.referral.findUnique.mockResolvedValue(null);
      await expect(service.trackConversion('bad-slug', referee)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when referrer tries to refer themselves', async () => {
      prisma.referral.findUnique.mockResolvedValue({
        slug: 'slug1',
        referrerAddress: earner,
        refereeAddress: null,
      });
      await expect(service.trackConversion('slug1', earner)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('getProof', () => {
    it('issues an oracle-signed proof for a completed referral', async () => {
      prisma.referral.findFirst.mockResolvedValue({
        slug: 'slug1',
        referrerAddress: earner,
        refereeAddress: referee,
        convertedAt: new Date(),
        proofIssued: false,
      });
      prisma.referral.update.mockResolvedValue({});

      const proof = await service.getProof(earner, CAMPAIGN_ID);

      expect(proof.campaignId).toBe(CAMPAIGN_ID);
      expect(proof.earner).toBe(earner);
      expect(proof.signature).toMatch(/^[0-9a-f]+$/);
      expect(proof.actionHash).toHaveLength(64);
      expect(oracle.signProof).toHaveBeenCalledTimes(1);
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { proofIssued: true } }),
      );
    });

    it('throws NotFoundException when no converted referral exists', async () => {
      prisma.referral.findFirst.mockResolvedValue(null);
      await expect(service.getProof(earner, CAMPAIGN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when proof already issued', async () => {
      prisma.referral.findFirst.mockResolvedValue({
        slug: 'slug1',
        referrerAddress: earner,
        refereeAddress: referee,
        convertedAt: new Date(),
        proofIssued: true,
      });
      await expect(service.getProof(earner, CAMPAIGN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
