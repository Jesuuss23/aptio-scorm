// HU-1515 · TOTP, cifrado del secreto y códigos de recuperación (CP-160).
import { describe, expect, it } from 'vitest';
import {
  base32,
  cifrar,
  claveCifrado,
  codigoDelPaso,
  descifrar,
  desdeBase32,
  hashCodigoRecuperacion,
  nuevoSecreto,
  nuevosCodigosRecuperacion,
  pasoDe,
  uriOtpauth,
  verificarCodigo,
} from '../src/auth/totp.js';

const SEMILLA_SHA1 = Buffer.from('12345678901234567890');
const SEMILLA_SHA256 = Buffer.from('12345678901234567890123456789012');
const SEMILLA_SHA512 = Buffer.from('1234567890123456789012345678901234567890123456789012345678901234');

describe('TOTP (RFC 6238, apéndice B)', () => {
  it.each([
    [59, '94287082', '46119246', '90693936'],
    [1_111_111_109, '07081804', '68084774', '25091201'],
    [1_111_111_111, '14050471', '67062674', '99943326'],
    [1_234_567_890, '89005924', '91819424', '93441116'],
    [2_000_000_000, '69279037', '90698825', '38618901'],
    [20_000_000_000, '65353130', '77737706', '47863826'],
  ])('a los %i s da los vectores de prueba de SHA-1, SHA-256 y SHA-512', (segundos, sha1, sha256, sha512) => {
    const paso = pasoDe(segundos * 1000);
    expect(codigoDelPaso(SEMILLA_SHA1, paso, 'sha1', 8)).toBe(sha1);
    expect(codigoDelPaso(SEMILLA_SHA256, paso, 'sha256', 8)).toBe(sha256);
    expect(codigoDelPaso(SEMILLA_SHA512, paso, 'sha512', 8)).toBe(sha512);
  });

  it('base32 ida y vuelta (RFC 4648) y secretos de 160 bits', () => {
    expect(base32(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(desdeBase32('mzxw 6ytb oi').toString()).toBe('foobar');
    const s = nuevoSecreto();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(desdeBase32(s)).toHaveLength(20);
    expect(() => desdeBase32('no válido!')).toThrow(/base32/);
  });

  it('acepta el paso actual y ±1, y rechaza fuera de la ventana o un código ya usado', () => {
    const secreto = base32(SEMILLA_SHA1);
    const ahora = 1_234_567_890_000;
    const paso = pasoDe(ahora);
    const codigo = (p: number) => codigoDelPaso(SEMILLA_SHA1, p);
    expect(verificarCodigo(secreto, codigo(paso), ahora, null)).toBe(paso);
    expect(verificarCodigo(secreto, codigo(paso - 1), ahora, null)).toBe(paso - 1);
    expect(verificarCodigo(secreto, codigo(paso + 1), ahora, null)).toBe(paso + 1);
    expect(verificarCodigo(secreto, codigo(paso - 2), ahora, null)).toBeNull();
    expect(verificarCodigo(secreto, codigo(paso + 2), ahora, null)).toBeNull();
    // Repetición: el mismo código (o uno anterior) ya no vale una vez aceptado.
    expect(verificarCodigo(secreto, codigo(paso), ahora, paso)).toBeNull();
    expect(verificarCodigo(secreto, codigo(paso - 1), ahora, paso - 1)).toBeNull();
    expect(verificarCodigo(secreto, codigo(paso + 1), ahora, paso)).toBe(paso + 1);
    // Formato: espacios se ignoran, letras o largo distinto no.
    expect(verificarCodigo(secreto, `${codigo(paso).slice(0, 3)} ${codigo(paso).slice(3)}`, ahora, null)).toBe(paso);
    expect(verificarCodigo(secreto, '12345', ahora, null)).toBeNull();
    expect(verificarCodigo(secreto, 'abcdef', ahora, null)).toBeNull();
  });

  it('arma la URI otpauth con el emisor y la cuenta', () => {
    const uri = uriOtpauth('JBSWY3DPEHPK3PXP', 'super@aptio.pe');
    expect(uri).toBe('otpauth://totp/Aptio%20SCORM:super%40aptio.pe?secret=JBSWY3DPEHPK3PXP&issuer=Aptio+SCORM&algorithm=SHA1&digits=6&period=30');
  });
});

describe('cifrado del secreto en reposo (AES-256-GCM)', () => {
  const clave = claveCifrado('clave-de-prueba');

  it('cifra con iv aleatorio y descifra con la misma clave', () => {
    const a = cifrar('JBSWY3DPEHPK3PXP', clave);
    const b = cifrar('JBSWY3DPEHPK3PXP', clave);
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(descifrar(a, clave)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('falla con otra clave o con el texto alterado', () => {
    const a = cifrar('JBSWY3DPEHPK3PXP', clave);
    expect(() => descifrar(a, claveCifrado('otra'))).toThrow(/authenticate/);
    const partes = a.split('.');
    // Se invierte un bit del texto cifrado: cambiar los últimos caracteres en base64 a veces no cambia ningún byte.
    const bytes = Buffer.from(partes[3]!, 'base64url');
    bytes[0]! ^= 1;
    partes[3] = bytes.toString('base64url');
    expect(() => descifrar(partes.join('.'), clave)).toThrow(/authenticate/);
    expect(() => descifrar('v2.x.y.z', clave)).toThrow(/formato/);
  });
});

describe('códigos de recuperación', () => {
  it('genera 10 códigos distintos y legibles', () => {
    const codigos = nuevosCodigosRecuperacion();
    expect(codigos).toHaveLength(10);
    expect(new Set(codigos).size).toBe(10);
    for (const c of codigos) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  });

  it('el hash ignora mayúsculas, espacios y guiones, y depende de la clave', () => {
    const clave = claveCifrado('k');
    expect(hashCodigoRecuperacion('ABCDE-FGHJK', clave)).toBe(hashCodigoRecuperacion(' abcde fghjk ', clave));
    expect(hashCodigoRecuperacion('ABCDE-FGHJK', clave)).not.toBe(hashCodigoRecuperacion('ABCDE-FGHJK', claveCifrado('otra')));
  });
});
