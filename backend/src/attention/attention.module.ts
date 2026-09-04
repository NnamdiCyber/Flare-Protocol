import { Module } from '@nestjs/common';
import { AttentionController } from './attention.controller';
import { AttentionService } from './attention.service';

@Module({
  controllers: [AttentionController],
  providers: [AttentionService],
})
export class AttentionModule {}
