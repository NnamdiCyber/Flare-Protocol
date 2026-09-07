/**
 * Injection token for the ioredis client.
 * Used with @Inject(REDIS_TOKEN) or the @InjectRedis() shorthand decorator.
 */
export const REDIS_TOKEN = 'REDIS_CLIENT';

import { Inject } from '@nestjs/common';

/** Shorthand parameter decorator: @InjectRedis() */
export const InjectRedis = () => Inject(REDIS_TOKEN);
