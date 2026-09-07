import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { StrKey } from '@stellar/stellar-sdk';
import { PrismaService } from '../common/prisma.service';
import { OracleService, ClaimProof } from '../oracle/oracle.service';

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracle: OracleService,
  ) {}

  /**
   * Generate a unique referral link for an earner on a campaign.
   * POST /referrals/link
   */
  async generateLink(
    earnerAddress: string,
    campaignId: string,
  ): Promise<{ referralLink: string }> {
    // Validate that campaignId is known
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    // Check for an existing unused link first (idempotent)
    const existing = await this.prisma.referral.findFirst({
      where: { campaignId, referrerAddress: earnerAddress },
    });
    if (existing) {
      return { referralLink: this.buildLink(existing.slug) };
    }

    const slug = uuidv4();
    await this.prisma.referral.create({
      data: {
        slug,
        campaignId,
        referrerAddress: earnerAddress,
      },
    });

    return { referralLink: this.buildLink(slug) };
  }

  /**
   * Record a referral conversion.
   * POST /referrals/track
   */
  async trackConversion(
    slug: string,
    refereeAddress: string,
  ): Promise<{ success: boolean }> {
    const referral = await this.prisma.referral.findUnique({ where: { slug } });
    if (!referral) {
      throw new NotFoundException(`Referral slug ${slug} not found`);
    }
    if (referral.refereeAddress) {
      // Already converted — idempotent OK
      return { success: true };
    }
    if (referral.referrerAddress === refereeAddress) {
      throw new BadRequestException('Referrer cannot refer themselves');
    }

    await this.prisma.referral.update({
      where: { slug },
      data: {
        refereeAddress,
        convertedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Issue an oracle-signed ClaimProof for a completed referral.
   * POST /referrals/proof/:campaignId  (JWT-protected)
   */
  async getProof(
    earnerAddress: string,
    campaignId: string,
  ): Promise<ClaimProof> {
    const referral = await this.prisma.referral.findFirst({
      where: {
        campaignId,
        referrerAddress: earnerAddress,
        convertedAt: { not: null },
      },
    });

    if (!referral) {
      throw new NotFoundException(
        'No completed referral found for this earner and campaign',
      );
    }
    if (referral.proofIssued) {
      throw new BadRequestException('Proof already issued for this referral');
    }
    if (!referral.refereeAddress) {
      throw new BadRequestException('Referral not yet converted');
    }

    // actionHash = SHA256(refereeAddress_bytes ‖ campaignId_bytes)
    const campaignIdBuf = Buffer.from(campaignId, 'hex');
    const refereeBytes = this.stellarAddressToBytes(referral.refereeAddress);
    const actionHash = createHash('sha256')
      .update(refereeBytes)
      .update(campaignIdBuf)
      .digest();

    const earnerPubkeyBytes = this.stellarAddressToBytes(earnerAddress);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.oracle.signProof(
      campaignIdBuf,
      earnerPubkeyBytes,
      actionHash,
      timestamp,
    );

    await this.prisma.referral.update({
      where: { slug: referral.slug },
      data: { proofIssued: true },
    });

    return {
      campaignId,
      earner: earnerAddress,
      actionHash: actionHash.toString('hex'),
      timestamp,
      signature: signature.toString('hex'),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private buildLink(slug: string): string {
    return `https://app.flareprotocol.io/r/${slug}`;
  }

  /**
   * Decode a Stellar G-address into its raw 32-byte public key.
   */
  private stellarAddressToBytes(address: string): Buffer {
    return Buffer.from(StrKey.decodeEd25519PublicKey(address));
  }
}
