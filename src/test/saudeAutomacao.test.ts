











import { describe, it, expect } from 'vitest';
import {
  classificar, deveAlertar, textoAlerta, erroDeConfiguracao,
} from '../../backend/utils/saudeAutomacao.js';

const AGORA = Date.UTC(2026, 8, 24, 14, 0, 0);
const hAtras = (h: number) => new Date(AGORA - h * 3600000).toISOString();
const P = { label: 'Vídeos do YouTube', maxHoras: 72 };

describe('a classificação por recência', () => {
  it('dentro do prazo é ok', () => {
    expect(classificar(P, hAtras(8), null, AGORA).status).toBe('ok');
    expect(classificar(P, hAtras(8), null, AGORA).horas).toBe(8);
  });

  it('passou do prazo é atrasado; passou do dobro é parado', () => {
    expect(classificar(P, hAtras(73), null, AGORA).status).toBe('atrasado');
    expect(classificar(P, hAtras(145), null, AGORA).status).toBe('parado');
  });

  it('exatamente no limite ainda é ok', () => {
    expect(classificar(P, hAtras(72), null, AGORA).status).toBe('ok');
  });

  it('tabela vazia é desconhecido, não falha do vigia', () => {
    expect(classificar(P, null, null, AGORA).status).toBe('desconhecido');
  });
});

describe('⚠️⚠️ erro de CADASTRO é falha do vigia, e alerta', () => {

  const ERRO_REAL = { code: '42703', message: 'column online_videos.created_at does not exist' };

  it('coluna inexistente vira erro_config', () => {
    expect(classificar(P, null, ERRO_REAL, AGORA).status).toBe('erro_config');
  });

  it('tabela inexistente vira erro_config', () => {
    expect(classificar(P, null, { code: '42P01', message: 'relation "x" does not exist' }, AGORA).status)
      .toBe('erro_config');
  });

  it('coluna fora do schema cache do PostgREST também', () => {
    expect(erroDeConfiguracao({ code: 'PGRST204', message: "Could not find the 'x' column" })).toBe(true);
  });


  it('erro_config ALERTA', () => {
    expect(deveAlertar('erro_config')).toBe(true);
    expect(deveAlertar('parado')).toBe(true);
    expect(deveAlertar('atrasado')).toBe(true);
  });

  it('ok e desconhecido não alertam', () => {
    expect(deveAlertar('ok')).toBe(false);
    expect(deveAlertar('desconhecido')).toBe(false);
  });



  it('o alerta aponta para o cadastro do monitor, não para o pipeline', () => {
    const t = textoAlerta({ ...P, status: 'erro_config', motivo: ERRO_REAL.message });
    expect(t.titulo).toContain('Monitor quebrado');
    expect(t.mensagem).toContain('NÃO está sendo vigiado');
    expect(t.mensagem).toContain('cadastro do monitor');
  });

  it('o alerta normal continua falando do pipeline', () => {
    const t = textoAlerta({ ...P, status: 'parado', horas: 573 });
    expect(t.titulo).toContain('Automação parada');
    expect(t.mensagem).toContain('573h');
  });
});

describe('⚠️ erro de EXECUÇÃO não vira erro_config', () => {


  it('timeout continua desconhecido', () => {
    expect(classificar(P, null, { message: 'fetch failed: ETIMEDOUT' }, AGORA).status)
      .toBe('desconhecido');
    expect(erroDeConfiguracao({ message: 'fetch failed' })).toBe(false);
  });
});

describe('⚠️ catálogo torto também é erro_config', () => {
  it('maxHoras ausente não vira "ok" silencioso', () => {
    expect(classificar({ label: 'X' }, hAtras(8), null, AGORA).status).toBe('erro_config');
  });

  it('timestamp ilegível não vira NaN horas', () => {
    const r = classificar(P, 'não é data', null, AGORA);
    expect(r.status).toBe('erro_config');
    expect(r.horas).toBeNull();
  });
});









describe('⚠️ o catálogo de pipelines é completo e conferível', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PIPELINES } = require('../../backend/services/monitorAutomacoes.js');

  it('toda entrada tem tabela, coluna, maxHoras e módulo', () => {
    expect(PIPELINES.length).toBeGreaterThan(0);
    for (const p of PIPELINES) {
      expect(p.tabela, `${p.chave} sem tabela`).toBeTruthy();
      expect(p.coluna, `${p.chave} sem coluna`).toBeTruthy();
      expect(p.modulo, `${p.chave} sem módulo`).toBeTruthy();
      expect(Number(p.maxHoras), `${p.chave} com maxHoras inválido`).toBeGreaterThan(0);
    }
  });

  it('as chaves são únicas (a dedup do alerta depende disso)', () => {
    const chaves = PIPELINES.map((p: { chave: string }) => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });




  it('as tabelas do YouTube são vigiadas por collected_at', () => {
    for (const chave of ['youtube_snap', 'youtube_vids']) {
      const p = PIPELINES.find((x: { chave: string }) => x.chave === chave);
      expect(p, `${chave} sumiu do catálogo`).toBeTruthy();
      expect(p.coluna, `${chave} voltou para uma coluna que não existe`).toBe('collected_at');
    }
  });
});
