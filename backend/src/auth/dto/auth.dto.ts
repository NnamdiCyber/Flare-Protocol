import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
} from 'class-validator';

export class ChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(256)
  publicKey: string;
}

export class VerifyDto {
  @IsString()
  @IsNotEmpty()
  publicKey: string;

  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  nonce: string;
}
