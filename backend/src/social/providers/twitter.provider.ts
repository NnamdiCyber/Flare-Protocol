import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TwitterPost {
  id: string;
  text: string;
  authorId: string;
}

export interface TwitterAccount {
  id: string;
  username: string;
  name: string;
  /** Account creation date ISO string */
  createdAt: string;
  /** Public metrics */
  followersCount: number;
  tweetCount: number;
}

@Injectable()
export class TwitterProvider {
  private readonly logger = new Logger(TwitterProvider.name);
  private readonly bearerToken: string;
  private readonly baseUrl = 'https://api.twitter.com/2';

  constructor(private readonly config: ConfigService) {
    this.bearerToken = this.config.get<string>('twitter.bearerToken') ?? '';
    if (!this.bearerToken) {
      this.logger.warn(
        'TWITTER_BEARER_TOKEN not set — Twitter verification will fail',
      );
    }
  }

  /**
   * Fetch a tweet by ID via Twitter API v2.
   */
  async getPost(postId: string): Promise<TwitterPost | null> {
    const url = `${this.baseUrl}/tweets/${postId}?tweet.fields=author_id,text`;
    const res = await this.fetchTwitter(url);
    if (!res?.data) return null;
    return {
      id: res.data.id as string,
      text: res.data.text as string,
      authorId: res.data.author_id as string,
    };
  }

  /**
   * Fetch an account's public info and metrics by username.
   */
  async getAccountInfo(username: string): Promise<TwitterAccount | null> {
    const url =
      `${this.baseUrl}/users/by/username/${username}` +
      `?user.fields=created_at,public_metrics`;
    const res = await this.fetchTwitter(url);
    if (!res?.data) return null;

    const metrics = res.data.public_metrics as Record<string, number> | undefined;
    return {
      id: res.data.id as string,
      username: res.data.username as string,
      name: res.data.name as string,
      createdAt: res.data.created_at as string,
      followersCount: metrics?.followers_count ?? 0,
      tweetCount: metrics?.tweet_count ?? 0,
    };
  }

  /**
   * Extract a tweet ID from a Twitter/X post URL.
   * Supports formats:
   *   https://twitter.com/user/status/123456789
   *   https://x.com/user/status/123456789
   */
  extractPostId(postUrl: string): string | null {
    const match = postUrl.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract the @username from a Twitter/X URL.
   */
  extractUsername(postUrl: string): string | null {
    const match = postUrl.match(/(?:twitter|x)\.com\/([^/]+)\/status/);
    return match ? match[1] : null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchTwitter(url: string): Promise<Record<string, unknown> | null> {
    if (!this.bearerToken) {
      throw new Error('Twitter bearer token not configured');
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      this.logger.error(
        `Twitter API error: ${response.status} ${response.statusText} — ${url}`,
      );
      return null;
    }

    return response.json() as Promise<Record<string, unknown>>;
  }
}
