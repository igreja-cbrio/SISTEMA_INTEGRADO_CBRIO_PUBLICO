import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';

import {
  tipoPelosBytes,
  validarArquivoComprovante,
  nomeExibicao,
  caminhoNoBucket,
  TETO_BYTES,
} from '../../backend/utils/arquivoComprovante.js';





const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(40)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(40)]);

describe('tipoPelosBytes', () => {
  it('reconhece PDF, JPEG e PNG', () => {
    expect(tipoPelosBytes(pdf)).toEqual({ mime: 'application/pdf', ext: 'pdf' });
    expect(tipoPelosBytes(jpg)).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
    expect(tipoPelosBytes(png)).toEqual({ mime: 'image/png', ext: 'png' });
  });
  it('executável é recusado mesmo com nome de PDF', () => {
    expect(tipoPelosBytes(exe)).toBeNull();
    expect(validarArquivoComprovante({ buffer: exe, originalname: 'comprovante.pdf', mimetype: 'application/pdf' }).ok).toBe(false);
  });
});

describe('validarArquivoComprovante', () => {
  it('vazio e acima do teto são recusados', () => {
    expect(validarArquivoComprovante({ buffer: Buffer.alloc(0) }).ok).toBe(false);
    const grande = Buffer.concat([pdf, Buffer.alloc(TETO_BYTES)]);
    expect(validarArquivoComprovante({ buffer: grande }).ok).toBe(false);
  });
  it('o mime devolvido é o dos bytes e o sha256 é estável', () => {
    const a = validarArquivoComprovante({ buffer: pdf, mimetype: 'image/png' });
    const b = validarArquivoComprovante({ buffer: pdf });
    expect(a.ok && a.mime).toBe('application/pdf');
    expect(a.ok && b.ok && a.sha256 === b.sha256).toBe(true);
    expect(a.ok && a.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('nome e caminho', () => {
  it('o nome de exibição perde caminho e caractere de controle', () => {
    const n = nomeExibicao('../../etc/pass\u0000wd.pdf', 'pdf');
    expect(n).not.toMatch(/[\\/]/);
    expect(n).not.toMatch(/\u0000/);
  });
  it('o caminho no bucket é gerado, nunca vem do nome enviado', () => {
    const c = caminhoNoBucket('solicitacao', '11111111-2222-3333-4444-555555555555', 'pdf');
    expect(c.startsWith('solicitacao/11111111-2222-3333-4444-555555555555/')).toBe(true);
    expect(c.endsWith('.pdf')).toBe(true);
    expect(c).not.toMatch(/\.\./);
  });
});
