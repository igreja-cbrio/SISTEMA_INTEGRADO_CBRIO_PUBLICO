












import { describe, it, expect } from 'vitest';
import * as back from '../../backend/utils/acessibilidadeBatismo.js';
import * as front from '../lib/acessibilidadeBatismo.js';

const LADOS: Array<[string, any]> = [['backend', back], ['front', front]];


function nosDoisLados(fn: (mod: any, lado: string) => void) {
  for (const [lado, mod] of LADOS) fn(mod, lado);
}

describe('acessibilidade do batismo · régua única tela+servidor', () => {
  it('⚠️ trocar "Sim" por "Não" com o texto na tela NÃO marca deficiência — é a razão da régua', () => {
    nosDoisLados((m, lado) => {
      const r = m.acessibilidadeBatismo({
        limitacao_mobilidade: 'Não',
        deficiencia_descricao: 'cadeirante',
      });
      expect(r.possui, lado).toBe(false);
      expect(r.descricao, lado).toBeNull();
      expect(r.pedeDescricao, lado).toBe(false);
    });
  });

  it('"Sim" com descrição guarda a DESCRIÇÃO, não a frase genérica', () => {
    nosDoisLados((m, lado) => {
      const r = m.acessibilidadeBatismo({
        limitacao_mobilidade: 'Sim',
        deficiencia_descricao: '  deficiência auditiva  ',
      });
      expect(r.possui, lado).toBe(true);
      expect(r.descricao, lado).toBe('deficiência auditiva');
      expect(r.pedeDescricao, lado).toBe(true);
    });
  });

  it('"Sim" sem descrição ainda avisa a equipe — é o piso, não o alvo', () => {
    nosDoisLados((m, lado) => {
      const r = m.acessibilidadeBatismo({ limitacao_mobilidade: 'Sim' });
      expect(r.possui, lado).toBe(true);
      expect(r.descricao, lado).toBe('Limitação de mobilidade');
      expect(r.pedeDescricao, lado).toBe(true);
    });
  });

  it('"Não" e não respondido não marcam nada', () => {
    nosDoisLados((m, lado) => {
      for (const limitacao_mobilidade of ['Não', 'nao', '', null, undefined]) {
        const r = m.acessibilidadeBatismo({ limitacao_mobilidade });
        expect(r.possui, `${lado} · ${String(limitacao_mobilidade)}`).toBe(false);
        expect(r.descricao, lado).toBeNull();
      }
      expect(m.acessibilidadeBatismo().possui, lado).toBe(false);
      expect(m.acessibilidadeBatismo(null).possui, lado).toBe(false);
    });
  });

  it('o caminho do ERP interno (checkbox) continua valendo', () => {
    nosDoisLados((m, lado) => {
      const r = m.acessibilidadeBatismo({ possui_deficiencia: true, deficiencia_descricao: 'autismo' });
      expect(r.possui, lado).toBe(true);
      expect(r.descricao, lado).toBe('autismo');
      expect(r.pedeDescricao, lado).toBe(true);

      const r2 = m.acessibilidadeBatismo({ possui_deficiencia: false, deficiencia_descricao: 'autismo' });
      expect(r2.possui, lado).toBe(false);
      expect(r2.descricao, lado).toBeNull();
    });
  });

  it('aceita a resposta com espaço e em qualquer caixa', () => {
    nosDoisLados((m, lado) => {
      for (const v of ['sim', 'SIM', ' Sim ', 'sIm']) {
        expect(m.disseSim(v), `${lado} · ${v}`).toBe(true);
      }
      for (const v of ['não', 'nao', 'simples', 'assim', '', null, undefined]) {
        expect(m.disseSim(v), `${lado} · ${String(v)}`).toBe(false);
      }
    });
  });

  it('⚠️ corta no teto da coluna — texto longo não pode estourar o insert', () => {
    nosDoisLados((m, lado) => {
      const r = m.acessibilidadeBatismo({
        limitacao_mobilidade: 'Sim',
        deficiencia_descricao: 'x'.repeat(900),
      });
      expect(r.descricao.length, lado).toBe(m.DESC_MAX);
      expect(m.DESC_MAX, lado).toBe(500);
    });
  });

  it('descrição só de espaços conta como vazia', () => {
    nosDoisLados((m, lado) => {
      const r = m.acessibilidadeBatismo({ limitacao_mobilidade: 'Sim', deficiencia_descricao: '   ' });
      expect(r.descricao, lado).toBe('Limitação de mobilidade');
      const r2 = m.acessibilidadeBatismo({ possui_deficiencia: true, deficiencia_descricao: '   ' });
      expect(r2.possui, lado).toBe(true);
      expect(r2.descricao, lado).toBeNull();
    });
  });
});
