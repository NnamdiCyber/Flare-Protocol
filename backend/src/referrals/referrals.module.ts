import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { OracleModule } from '../oracle/oracle.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [OracleModule, AuthModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
