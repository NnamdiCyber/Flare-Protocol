import { Controller, Get, Param, Query } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  /**
   * GET /campaigns
   * Optional query params: type (CampaignType), page (number)
   */
  @Get()
  listCampaigns(
    @Query('type') type?: string,
    @Query('page') page = '0',
  ): Promise<unknown[]> {
    return this.campaignsService.listCampaigns(type, parseInt(page, 10));
  }

  /**
   * GET /campaigns/:id
   */
  @Get(':id')
  getCampaign(@Param('id') id: string): Promise<unknown> {
    return this.campaignsService.getCampaign(id);
  }

  /**
   * GET /campaigns/:id/stats
   */
  @Get(':id/stats')
  getCampaignStats(
    @Param('id') id: string,
  ): Promise<Record<string, number>> {
    return this.campaignsService.getCampaignStats(id);
  }
}
