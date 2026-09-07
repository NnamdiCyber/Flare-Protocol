import { IsString, IsNotEmpty, IsIn, IsNumber } from 'class-validator';

export class AttentionSignalDto {
  @IsString()
  @IsNotEmpty()
  sessionToken!: string;

  @IsIn(['scroll', 'video_play', 'video_complete', 'heartbeat'])
  signalType!: 'scroll' | 'video_play' | 'video_complete' | 'heartbeat';

  @IsNumber()
  value!: number;
}
