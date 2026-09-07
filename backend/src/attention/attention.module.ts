import { Module } from '@nestjs/common';
import { AttentionController } from './attention.controller';
import { AttentionService } from './attention.service';
import { OracleModule } from '../oracle/oracle.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [OracleModule, AuthModule],
  controllers: [AttentionController],
  providers: [AttentionService],
})
export class AttentionModule {}
