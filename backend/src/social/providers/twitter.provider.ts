import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Twitter/X API v2 provider — stub for Day 3, fully implemented on Day 4.
 */
@Injectable()
export class TwitterProvider {
  constructor(private readonly config: ConfigService) {}

  async getPost(_postId: string): Promise<unknown> {
    throw new Error('Not implemented — Day 4');
  }

  async getAccountInfo(_username: string): Promise<unknown> {
    throw new Error('Not implemented — Day 4');
  }
}
