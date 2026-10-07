import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';























const TELAS = [
  'src/pages/ministerial/totemKids/GestaoCriancas.tsx',
  'src/pages/ministerial/totemKids/EditarEtiquetaModal.tsx',
  'src/pages/ministerial/totemKids/TotemKidsTesteEtiqueta.tsx',
];

function semComentarios(js: string): string {
  return js
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('telas do Kids que mandam imagem de arquivo', () => {
  for (const rel of TELAS) {
    const src = semComentarios(readFileSync(resolve(__dirname, '../../', rel), 'utf8'));

    it(`${rel.split('/').pop()} usa a régua de redução`, () => {
      expect(src).toContain('arquivoParaDataUrl');
    });


    it(`${rel.split('/').pop()} não lê o arquivo direto como base64`, () => {
      expect(src).not.toContain('readAsDataURL');
    });





    it(`${rel.split('/').pop()} não promete mais o limite antigo de 5MB`, () => {
      expect(src).not.toContain('máx 5MB');
    });
  }
});
