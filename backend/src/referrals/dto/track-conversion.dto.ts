import { IsString, IsNotEmpty } from 'class-validator';

export class TrackConversionDto {
  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsNotEmpty()
  refereeAddress!: string;
}
