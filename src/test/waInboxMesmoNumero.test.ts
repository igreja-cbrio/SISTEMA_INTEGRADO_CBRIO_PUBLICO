import { describe, it, expect } from 'vitest';
// @ts-ignore — serviço do backend em CommonJS, sem tipos.
import waInbox from '../../backend/services/waInbox.js';

const { mesmoNumeroBR, pathDoBucketPublico } = waInbox;





describe('mesmoNumeroBR · reconciliação do nono dígito', () => {
  it('mesmo número com e sem o 9 é a MESMA conversa', () => {
    expect(mesmoNumeroBR('5521999998888', '552199998888')).toBe(true);
    expect(mesmoNumeroBR('552199998888', '5521999998888')).toBe(true);
  });

  it('idêntico é igual (com ou sem 9)', () => {
    expect(mesmoNumeroBR('5521999998888', '5521999998888')).toBe(true);
    expect(mesmoNumeroBR('552188887777', '552188887777')).toBe(true);
  });

  it('DDD diferente NUNCA é a mesma pessoa (mesmo local)', () => {
    expect(mesmoNumeroBR('5521999998888', '5511999998888')).toBe(false);
  });

  it('local diferente não casa (último dígito diverge)', () => {
    expect(mesmoNumeroBR('5521999998888', '5521999998889')).toBe(false);
  });



  it('o 9 removível é só o prefixo do celular, não um 9 qualquer', () => {


    expect(mesmoNumeroBR('5521988897777', '552188889777')).toBe(false);
  });

  it('fixo (local de 8) casa consigo mesmo e não ganha 9 de ninguém', () => {
    expect(mesmoNumeroBR('552133334444', '552133334444')).toBe(true);
    expect(mesmoNumeroBR('552133334444', '5521933334444')).toBe(true);
  });

  it('número estrangeiro/curto não é adivinhado', () => {
    expect(mesmoNumeroBR('41000000018', '5541765764538')).toBe(false);
    expect(mesmoNumeroBR('99998888', '5521999998888')).toBe(false);
    expect(mesmoNumeroBR('', '5521999998888')).toBe(false);
    expect(mesmoNumeroBR(null, undefined)).toBe(false);
  });
});



describe('pathDoBucketPublico · retenção do wa-inbox público', () => {
  it('extrai o path de uma URL pública do bucket', () => {
    expect(pathDoBucketPublico(
      'https://example.supabase.co/storage/v1/object/public/wa-inbox/conv-1/out-123-abc.jpg',
    )).toBe('conv-1/out-123-abc.jpg');
  });

  it('path com caractere codificado volta decodificado', () => {
    expect(pathDoBucketPublico(
      'https://x.supabase.co/storage/v1/object/public/wa-inbox/c/doc%20final.pdf',
    )).toBe('c/doc final.pdf');
  });

  it('URL de OUTRO bucket (ou externa) devolve null — nunca apagar fora do wa-inbox', () => {
    expect(pathDoBucketPublico('https://x.supabase.co/storage/v1/object/public/kids-documentos/a.jpg')).toBe(null);
    expect(pathDoBucketPublico('https://exemplo.com/foto.jpg')).toBe(null);
    expect(pathDoBucketPublico('conv-1/in-123.jpg')).toBe(null);
    expect(pathDoBucketPublico(null)).toBe(null);
  });
});
