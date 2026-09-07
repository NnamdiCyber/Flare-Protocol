import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class VerifySocialDto {
  @IsString()
  @IsNotEmpty()
  postUrl!: string;

  @IsString()
  @IsNotEmpty()
  earnerAddress!: string;

  @IsString()
  @IsNotEmpty()
  campaignId!: string;

  @IsIn(['twitter'])
  platform!: string;
}
