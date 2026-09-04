import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT wallet guard — protects routes that require a valid Stellar wallet auth token.
 * Applied as @UseGuards(WalletGuard) on controllers or individual routes.
 */
@Injectable()
export class WalletGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(err: Error, user: TUser): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
