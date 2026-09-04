import { Module } from '@nestjs/common';
import { LearnController } from './learn.controller';
import { LearnService } from './learn.service';

@Module({
  controllers: [LearnController],
  providers: [LearnService],
})
export class LearnModule {}
