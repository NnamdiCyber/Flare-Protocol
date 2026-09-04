import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { rpc, Contract, xdr, scValToNative } from '@stellar/stellar-sdk';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  private readonly rpc: rpc.Server;
  private readonly campaignManagerId: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.rpc = new rpc.Server(
      this.config.get<string>('stellar.rpcUrl') as string,
    );
    this.campaignManagerId = this.config.get<string>(
      'contracts.campaignManager',
    ) as string;
  }

  /**
   * GET /campaigns
   * Queries the campaign_manager contract for active campaigns.
   * Falls back to DB cache if RPC is unavailable.
   */
  async listCampaigns(campaignType?: string, page = 0): Promise<unknown[]> {
    if (!this.campaignManagerId) {
      this.logger.warn(
        'CAMPAIGN_MANAGER_CONTRACT_ID not set — returning DB cache',
      );
      return this.listFromDb(campaignType);
    }

    try {
      const contract = new Contract(this.campaignManagerId);
      const typeArg = campaignType
        ? xdr.ScVal.scvString(campaignType)
        : xdr.ScVal.scvVoid();
      const pageArg = xdr.ScVal.scvU32(page);

      const result = await this.rpc.simulateTransaction(
        // Build a read-only simulation call
        contract.call('list_active_campaigns', typeArg, pageArg) as any,
      );

      if (rpc.Api.isSimulationSuccess(result) && result.result) {
        return scValToNative(result.result.retval) as unknown[];
      }
    } catch (err) {
      this.logger.error(
        `RPC call failed, falling back to DB: ${(err as Error).message}`,
      );
    }

    return this.listFromDb(campaignType);
  }

  /**
   * GET /campaigns/:id
   * Returns a single campaign by on-chain campaign ID.
   */
  async getCampaign(id: string): Promise<unknown> {
    if (!this.campaignManagerId) {
      return this.prisma.campaign.findUnique({ where: { campaignId: id } });
    }

    try {
      const contract = new Contract(this.campaignManagerId);
      const idArg = xdr.ScVal.scvBytes(Buffer.from(id, 'hex'));

      const result = await this.rpc.simulateTransaction(
        contract.call('get_campaign', idArg) as any,
      );

      if (rpc.Api.isSimulationSuccess(result) && result.result) {
        return scValToNative(result.result.retval);
      }
    } catch (err) {
      this.logger.error(
        `get_campaign RPC failed: ${(err as Error).message}`,
      );
    }

    return this.prisma.campaign.findUnique({ where: { campaignId: id } });
  }

  /**
   * GET /campaigns/:id/stats
   * Returns participation statistics for a campaign from the DB.
   */
  async getCampaignStats(id: string): Promise<Record<string, number>> {
    const [referrals, social, learn, attention] = await Promise.all([
      this.prisma.referral.count({
        where: { campaignId: id, convertedAt: { not: null } },
      }),
      this.prisma.socialVerification.count({
        where: { campaignId: id, verifiedAt: { not: null } },
      }),
      this.prisma.learnSubmission.count({
        where: { campaignId: id, passed: true },
      }),
      this.prisma.attentionSession.count({
        where: { campaignId: id, completed: true },
      }),
    ]);

    return {
      referralConversions: referrals,
      socialVerifications: social,
      learnCompletions: learn,
      attentionCompletions: attention,
      totalCompletions: referrals + social + learn + attention,
    };
  }

  private async listFromDb(campaignType?: string) {
    return this.prisma.campaign.findMany({
      where: {
        status: 'Active',
        ...(campaignType ? { campaignType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
