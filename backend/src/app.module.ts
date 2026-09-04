import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { OracleModule } from './oracle/oracle.module';
import { ReferralsModule } from './referrals/referrals.module';
import { SocialModule } from './social/social.module';
import { LearnModule } from './learn/learn.module';
import { AttentionModule } from './attention/attention.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    AuthModule,
    CampaignsModule,
    OracleModule,
    ReferralsModule,
    SocialModule,
    LearnModule,
    AttentionModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
