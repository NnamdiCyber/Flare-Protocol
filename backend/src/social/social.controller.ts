import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SocialService } from './social.service';
import { WalletGuard } from '../auth/wallet.guard';
import { VerifySocialDto } from './dto/verify-social.dto';

@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  /**
   * Submit a post URL for social verification.
   * POST /social/verify
   */
  @Post('verify')
  verify(@Body() dto: VerifySocialDto) {
    return this.socialService.verifySocialPost(
      dto.postUrl,
      dto.earnerAddress,
      dto.campaignId,
      dto.platform,
    );
  }

  /**
   * Return an oracle-signed proof if the post has been verified.
   * GET /social/proof/:campaignId
   * Requires JWT auth.
   */
  @UseGuards(WalletGuard)
  @Get('proof/:campaignId')
  getProof(
    @Param('campaignId') campaignId: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.socialService.getProof(req.user.sub, campaignId);
  }
}
