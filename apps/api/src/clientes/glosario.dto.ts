import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { IDIOMAS_VOZ, MAX_PRONUNCIADO, MAX_TERMINO } from '@aptio/schema/voz';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Término del glosario: se traduce como se indica o no se traduce (RN-08-1). */
export class GlosarioTerminoDto {
  @ApiProperty({ example: 'LOTO' }) @Transform(recortar) @IsString() @MinLength(1) @MaxLength(MAX_TERMINO) termino: string;
  @ApiPropertyOptional({ nullable: true, example: 'lockout-tagout' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @Transform(recortar) @IsString() @MaxLength(MAX_TERMINO) traduccion?: string | null;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() noTraducir?: boolean;
}

/** Cómo dice la voz un término escrito, por idioma (CP-027). Texto llano: la app arma el SSML. */
export class PronunciacionTerminoDto {
  @ApiProperty({ enum: IDIOMAS_VOZ }) @IsIn(IDIOMAS_VOZ) idioma: 'es' | 'en';
  @ApiProperty({ example: 'LOTO' }) @Transform(recortar) @IsString() @MinLength(1) @MaxLength(MAX_TERMINO) escrito: string;
  @ApiProperty({ example: 'lo-to' }) @Transform(recortar) @IsString() @MinLength(1) @MaxLength(MAX_PRONUNCIADO) pronunciado: string;
}
