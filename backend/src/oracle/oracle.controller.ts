import { Controller, Get } from '@nestjs/common';
import { OracleService } from './oracle.service';

@Controller('oracle')
export class OracleController {
  constructor(private readonly oracleService: OracleService) {}

  /**
   * GET /oracle/pubkey
   * Returns the oracle public key as a hex string.
   * Advertisers store this on-chain as oracle_pubkey when creating a campaign.
   */
  @Get('pubkey')
  getPublicKey(): { publicKey: string } {
    return { publicKey: this.oracleService.getPublicKey() };
  }
}
