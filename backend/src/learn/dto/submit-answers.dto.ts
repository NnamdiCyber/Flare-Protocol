import { IsObject, IsNotEmpty } from 'class-validator';

export class SubmitAnswersDto {
  @IsObject()
  @IsNotEmpty()
  answers!: Record<string, string>;
}
