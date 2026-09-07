import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_TOKEN } from './redis.token';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const redisUrl = config.get<string>('redis.url') ?? 'redis://localhost:6379';
        return new Redis(redisUrl);
      },
    },
  ],
  exports: [REDIS_TOKEN],
})
export class RedisModule {}
