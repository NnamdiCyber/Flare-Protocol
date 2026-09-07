import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AttentionService } from './attention.service';
import { WalletGuard } from '../auth/wallet.guard';
import { StartSessionDto } from './dto/start-session.dto';
import { AttentionSignalDto } from './dto/attention-signal.dto';

@Controller('attention')
export class AttentionController {
  constructor(private readonly attentionService: AttentionService) {}

  /**
   * Start an ad attention session.
   * POST /attention/start
   * Requires JWT auth.
   */
  @UseGuards(WalletGuard)
  @Post('start')
  startSession(
    @Body() dto: StartSessionDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.attentionService.startSession(req.user.sub, dto.campaignId);
  }

  /**
   * Send an attention signal (heartbeat, scroll, video event).
   * POST /attention/signal
   */
  @Post('signal')
  recordSignal(@Body() dto: AttentionSignalDto) {
    return this.attentionService.recordSignal(
      dto.sessionToken,
      dto.signalType,
      dto.value,
    );
  }

  /**
   * Return an oracle-signed proof if the attention threshold is met.
   * GET /attention/proof/:campaignId
   * Requires JWT auth.
   */
  @UseGuards(WalletGuard)
  @Get('proof/:campaignId')
  getProof(
    @Param('campaignId') campaignId: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.attentionService.getProof(req.user.sub, campaignId);
  }
}
