import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { StrKey } from '@stellar/stellar-sdk';
import { PrismaService } from '../common/prisma.service';
import { OracleService, ClaimProof } from '../oracle/oracle.service';
import { TwitterProvider } from './providers/twitter.provider';

export interface VerifyResult {
  verified: boolean;
  reason?: string;
}

/** Minimum account age in days for social verification anti-fraud */
const DEFAULT_MIN_ACCOUNT_AGE_DAYS = 30;

/** Default minimum follower count */
const DEFAULT_MIN_FOLLOWERS = 10;

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oracle: OracleService,
    private readonly twitter: TwitterProvider,
  ) {}

  /**
   * Verify a social post against campaign criteria and record the result.
   * POST /social/verify
   */
  async verifySocialPost(
    postUrl: string,
    earnerAddress: string,
    campaignId: string,
    platform: string,
  ): Promise<VerifyResult> {
    if (platform !== 'twitter') {
      return { verified: false, reason: `Platform ${platform} not supported in v1` };
    }

    // Fetch campaign from DB for config (min followers, hashtag requirements etc.)
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    // Parse post ID and username from URL
    const postId = this.twitter.extractPostId(postUrl);
    if (!postId) {
      return { verified: false, reason: 'Could not parse tweet ID from URL' };
    }
    const username = this.twitter.extractUsername(postUrl);
    if (!username) {
      return { verified: false, reason: 'Could not parse username from URL' };
    }

    // Fetch the tweet
    const post = await this.twitter.getPost(postId);
    if (!post) {
      return { verified: false, reason: 'Tweet not found or inaccessible' };
    }

    // Fetch account info for anti-fraud checks
    const account = await this.twitter.getAccountInfo(username);
    if (!account) {
      return { verified: false, reason: 'Twitter account not found' };
    }

    // Anti-fraud: minimum account age
    const accountAgeMs =
      Date.now() - new Date(account.createdAt).getTime();
    const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);
    if (accountAgeDays < DEFAULT_MIN_ACCOUNT_AGE_DAYS) {
      return {
        verified: false,
        reason: `Account must be at least ${DEFAULT_MIN_ACCOUNT_AGE_DAYS} days old`,
      };
    }

    // Anti-fraud: minimum follower count
    if (account.followersCount < DEFAULT_MIN_FOLLOWERS) {
      return {
        verified: false,
        reason: `Account must have at least ${DEFAULT_MIN_FOLLOWERS} followers`,
      };
    }

    // Upsert verification record
    await this.prisma.socialVerification.upsert({
      where: { campaignId_earnerAddress: { campaignId, earnerAddress } },
      create: {
        campaignId,
        earnerAddress,
        postUrl,
        platform,
        verifiedAt: new Date(),
      },
      update: {
        postUrl,
        verifiedAt: new Date(),
        proofIssued: false,
      },
    });

    this.logger.log(
      `Social verification passed: earner=${earnerAddress} campaign=${campaignId}`,
    );
    return { verified: true };
  }

  /**
   * Return an oracle-signed ClaimProof for a verified social post.
   * GET /social/proof/:campaignId  (JWT-protected)
   */
  async getProof(earnerAddress: string, campaignId: string): Promise<ClaimProof> {
    const verification = await this.prisma.socialVerification.findUnique({
      where: { campaignId_earnerAddress: { campaignId, earnerAddress } },
    });

    if (!verification) {
      throw new NotFoundException('No social verification record found');
    }
    if (!verification.verifiedAt) {
      throw new BadRequestException('Social post not yet verified');
    }
    if (verification.proofIssued) {
      throw new BadRequestException('Proof already issued for this verification');
    }

    // actionHash = SHA256(postUrl_bytes ‖ campaignId_bytes)
    const campaignIdBuf = Buffer.from(campaignId, 'hex');
    const actionHash = createHash('sha256')
      .update(Buffer.from(verification.postUrl))
      .update(campaignIdBuf)
      .digest();

    const earnerPubkeyBytes = Buffer.from(
      StrKey.decodeEd25519PublicKey(earnerAddress),
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.oracle.signProof(
      campaignIdBuf,
      earnerPubkeyBytes,
      actionHash,
      timestamp,
    );

    await this.prisma.socialVerification.update({
      where: { campaignId_earnerAddress: { campaignId, earnerAddress } },
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
}
