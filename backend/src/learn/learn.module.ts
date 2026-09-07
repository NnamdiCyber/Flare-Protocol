import { Module } from '@nestjs/common';
import { LearnController } from './learn.controller';
import { LearnService } from './learn.service';
import { OracleModule } from '../oracle/oracle.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [OracleModule, AuthModule],
  controllers: [LearnController],
  providers: [LearnService],
})
export class LearnModule {}
