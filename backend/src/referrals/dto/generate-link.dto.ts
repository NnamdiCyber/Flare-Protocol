import { IsString, IsNotEmpty } from 'class-validator';

export class GenerateLinkDto {
  @IsString()
  @IsNotEmpty()
  earnerAddress!: string;

  @IsString()
  @IsNotEmpty()
  campaignId!: string;
}
