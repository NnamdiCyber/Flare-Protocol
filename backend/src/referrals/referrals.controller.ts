import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { WalletGuard } from '../auth/wallet.guard';
import { GenerateLinkDto } from './dto/generate-link.dto';
import { TrackConversionDto } from './dto/track-conversion.dto';

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  /**
   * Generate a unique referral link for the earner.
   * POST /referrals/link
   */
  @Post('link')
  generateLink(@Body() dto: GenerateLinkDto) {
    return this.referralsService.generateLink(dto.earnerAddress, dto.campaignId);
  }

  /**
   * Record a referral conversion (called when referee clicks the link and joins).
   * POST /referrals/track
   */
  @Post('track')
  trackConversion(@Body() dto: TrackConversionDto) {
    return this.referralsService.trackConversion(dto.slug, dto.refereeAddress);
  }

  /**
   * Return an oracle-signed ClaimProof for a completed referral.
   * POST /referrals/proof/:campaignId
   * Requires JWT auth.
   */
  @UseGuards(WalletGuard)
  @Post('proof/:campaignId')
  getProof(@Param('campaignId') campaignId: string, @Request() req: { user: { sub: string } }) {
    return this.referralsService.getProof(req.user.sub, campaignId);
  }
}
