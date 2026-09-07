import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { TwitterProvider } from './providers/twitter.provider';
import { OracleModule } from '../oracle/oracle.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [OracleModule, AuthModule],
  controllers: [SocialController],
  providers: [SocialService, TwitterProvider],
})
export class SocialModule {}
