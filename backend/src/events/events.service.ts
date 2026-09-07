import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SorobanRpc, xdr, scValToNative } from '@stellar/stellar-sdk';
import { PrismaService } from '../common/prisma.service';

// How long between polling cycles (ms)
const POLL_INTERVAL_MS = 5_000;

// Maximum number of events to fetch per poll
const EVENTS_LIMIT = 100;

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private server!: SorobanRpc.Server;
  private rewardVaultId!: string;
  private campaignManagerId!: string;

  /** Ledger sequence number from which we begin scanning for new events */
  private startLedger = 0;

  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const rpcUrl = this.config.get<string>('stellar.rpcUrl') ?? '';
    this.rewardVaultId = this.config.get<string>('contracts.rewardVault') ?? '';
    this.campaignManagerId =
      this.config.get<string>('contracts.campaignManager') ?? '';

    if (!rpcUrl || !this.rewardVaultId || !this.campaignManagerId) {
      this.logger.warn(
        'Stellar RPC URL or contract IDs not configured — event listener disabled',
      );
      return;
    }

    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: true });
    this.logger.log('Soroban event listener starting...');
    this.schedulePoll();
  }

  onModuleDestroy(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Polling loop
  // ---------------------------------------------------------------------------

  private schedulePoll(): void {
    this.pollTimer = setTimeout(() => {
      void this.poll().finally(() => this.schedulePoll());
    }, POLL_INTERVAL_MS);
  }

  private async poll(): Promise<void> {
    try {
      await this.fetchRewardVaultEvents();
      await this.fetchCampaignManagerEvents();
    } catch (err) {
      this.logger.error('Error during event poll:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // RewardVault — "RewardClaimed" events
  // ---------------------------------------------------------------------------

  private async fetchRewardVaultEvents(): Promise<void> {
    if (!this.rewardVaultId) return;

    const filter: SorobanRpc.Api.EventFilter = {
      type: 'contract',
      contractIds: [this.rewardVaultId],
    };

    const response = await this.server.getEvents({
      startLedger: this.startLedger || undefined,
      filters: [filter],
      limit: EVENTS_LIMIT,
    });

    for (const event of response.events) {
      if (this.topicMatches(event, 'RewardClaimed')) {
        await this.handleRewardClaimed(event);
      }
      // Advance cursor to just past this event's ledger
      if (event.ledger > this.startLedger) {
        this.startLedger = event.ledger + 1;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CampaignManager — state change events
  // ---------------------------------------------------------------------------

  private async fetchCampaignManagerEvents(): Promise<void> {
    if (!this.campaignManagerId) return;

    const filter: SorobanRpc.Api.EventFilter = {
      type: 'contract',
      contractIds: [this.campaignManagerId],
    };

    const response = await this.server.getEvents({
      startLedger: this.startLedger || undefined,
      filters: [filter],
      limit: EVENTS_LIMIT,
    });

    for (const event of response.events) {
      if (this.topicMatches(event, 'CampaignPaused')) {
        await this.handleCampaignStateChange(event, 'Paused');
      } else if (this.topicMatches(event, 'CampaignResumed')) {
        await this.handleCampaignStateChange(event, 'Active');
      } else if (this.topicMatches(event, 'CampaignExpired')) {
        await this.handleCampaignStateChange(event, 'Expired');
      } else if (this.topicMatches(event, 'CampaignDrained')) {
        await this.handleCampaignStateChange(event, 'Drained');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * RewardClaimed event: update Earner.totalEarned in DB.
   *
   * Expected event value layout (from reward_vault contract):
   *   topics: ["RewardClaimed", campaign_id, earner_address]
   *   data:   amount (i128)
   */
  private async handleRewardClaimed(
    event: SorobanRpc.Api.EventResponse,
  ): Promise<void> {
    try {
      // The event topics are XDR-encoded SCVals; topics[0] = event name
      const topics = event.topic;
      if (topics.length < 3) return;

      const earnerScVal = topics[2];
      const earnerAddress = this.scValToString(earnerScVal);
      if (!earnerAddress) return;

      const amountNative = scValToNative(event.value) as bigint | number;
      const amount = BigInt(amountNative.toString());

      await this.prisma.earner.upsert({
        where: { stellarAddress: earnerAddress },
        create: {
          stellarAddress: earnerAddress,
          totalEarned: amount,
          campaignsCompleted: 1,
        },
        update: {
          totalEarned: { increment: amount },
          campaignsCompleted: { increment: 1 },
        },
      });

      this.logger.log(
        `RewardClaimed: earner=${earnerAddress} amount=${amount}`,
      );
    } catch (err) {
      this.logger.error('Error handling RewardClaimed event:', err);
    }
  }

  /**
   * Campaign state change: update Campaign.status in DB.
   *
   * Expected event topics:
   *   topics: ["CampaignPaused"|"CampaignResumed"|..., campaign_id_hex]
   */
  private async handleCampaignStateChange(
    event: SorobanRpc.Api.EventResponse,
    newStatus: string,
  ): Promise<void> {
    try {
      const topics = event.topic;
      if (topics.length < 2) return;

      const campaignIdScVal = topics[1];
      const campaignId = this.scValToHex(campaignIdScVal);
      if (!campaignId) return;

      await this.prisma.campaign.updateMany({
        where: { campaignId },
        data: { status: newStatus },
      });

      this.logger.log(
        `Campaign ${campaignId} state → ${newStatus}`,
      );
    } catch (err) {
      this.logger.error('Error handling campaign state change event:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Check if the first topic of an event matches the expected event name.
   * The topic is an XDR SCVal of type Symbol.
   */
  private topicMatches(
    event: SorobanRpc.Api.EventResponse,
    name: string,
  ): boolean {
    try {
      const firstTopic = event.topic[0];
      const native = scValToNative(firstTopic);
      return native === name;
    } catch {
      return false;
    }
  }

  /** Convert an address SCVal to its string representation. */
  private scValToString(scVal: xdr.ScVal): string | null {
    try {
      const native = scValToNative(scVal);
      return typeof native === 'string' ? native : null;
    } catch {
      return null;
    }
  }

  /** Convert a BytesN SCVal to a hex string. */
  private scValToHex(scVal: xdr.ScVal): string | null {
    try {
      const native = scValToNative(scVal);
      if (native instanceof Uint8Array || Buffer.isBuffer(native)) {
        return Buffer.from(native).toString('hex');
      }
      if (typeof native === 'string') return native;
      return null;
    } catch {
      return null;
    }
  }
}
