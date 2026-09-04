import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ChallengeDto, VerifyDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/challenge
   * Body: { publicKey: string }
   * Returns a nonce the wallet must sign.
   */
  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  challenge(@Body() dto: ChallengeDto): { nonce: string } {
    return this.authService.challenge(dto);
  }

  /**
   * POST /auth/verify
   * Body: { publicKey, signature, nonce }
   * Returns a JWT access token on success.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyDto): { accessToken: string } {
    return this.authService.verify(dto);
  }
}
