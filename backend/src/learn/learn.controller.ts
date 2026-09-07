import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { LearnService } from './learn.service';
import { WalletGuard } from '../auth/wallet.guard';
import { SubmitAnswersDto } from './dto/submit-answers.dto';

@Controller('learn')
export class LearnController {
  constructor(private readonly learnService: LearnService) {}

  /**
   * Submit quiz answers for grading.
   * POST /learn/submit/:campaignId
   * Requires JWT auth.
   */
  @UseGuards(WalletGuard)
  @Post('submit/:campaignId')
  submit(
    @Param('campaignId') campaignId: string,
    @Body() dto: SubmitAnswersDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.learnService.submitAnswers(req.user.sub, campaignId, dto.answers);
  }

  /**
   * Return an oracle-signed proof if the submission passed.
   * GET /learn/proof/:campaignId
   * Requires JWT auth.
   */
  @UseGuards(WalletGuard)
  @Get('proof/:campaignId')
  getProof(
    @Param('campaignId') campaignId: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.learnService.getProof(req.user.sub, campaignId);
  }
}
