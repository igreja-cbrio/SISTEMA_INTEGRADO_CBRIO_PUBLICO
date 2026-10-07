import { describe, it, expect } from 'vitest';
import {
  ESTADOS_ESPERADOS,
  classificarDiagOnline,
  patchDiagOnline,
} from '../../backend/utils/onlineDiag.js';

const AGORA = '2026-08-18T09:00:00.000Z';

describe('classificarDiagOnline · estado normal ≠ erro', () => {
  it('⚠️ "live_encerrada_ou_sem_dado" é ESTADO — foi o que gerava o alarme falso', () => {



    expect(classificarDiagOnline('live_encerrada_ou_sem_dado')).toBe('estado');
  });

  it('os outros estados esperados também não são erro', () => {
    expect(classificarDiagOnline('sem_live_ativa')).toBe('estado');
    expect(classificarDiagOnline('sem_video_compativel')).toBe('estado');
    expect(classificarDiagOnline('sem_horario_culto')).toBe('estado');
  });

  it('sucesso (vazio/null) é estado, não erro', () => {
    expect(classificarDiagOnline(null)).toBe('estado');
    expect(classificarDiagOnline(undefined)).toBe('estado');
    expect(classificarDiagOnline('')).toBe('estado');
    expect(classificarDiagOnline('   ')).toBe('estado');
  });

  it('⚠️ falha REAL do token continua sendo erro', () => {
    expect(classificarDiagOnline('invalid_grant')).toBe('erro');
    expect(classificarDiagOnline('quotaExceeded')).toBe('erro');
    expect(classificarDiagOnline('live_monitor: 403 Forbidden')).toBe('erro');
    expect(classificarDiagOnline('Canal Rede Social CBrio não tem acesso aos videos'))
      .toBe('erro');
  });

  it('⚠️⚠️ motivo DESCONHECIDO é erro (fail-closed)', () => {


    expect(classificarDiagOnline('motivo_que_ninguem_viu_ainda')).toBe('erro');
  });

  it('⚠️ compara por IGUALDADE, não por prefixo', () => {


    expect(classificarDiagOnline('broadcast: sem_live_ativa (403 Forbidden)')).toBe('erro');
    expect(classificarDiagOnline('live_encerrada_ou_sem_dado extra')).toBe('erro');
  });

  it('a lista é congelada — ninguém acrescenta estado em runtime', () => {
    expect(Object.isFrozen(ESTADOS_ESPERADOS)).toBe(true);
  });
});

describe('patchDiagOnline · o que vai pro banco', () => {
  it('estado esperado LIMPA o last_error e carimba a checagem', () => {
    expect(patchDiagOnline('live_encerrada_ou_sem_dado', AGORA))
      .toEqual({ last_check_at: AGORA, last_error: null });
  });

  it('⚠️ limpar é obrigatório: erro de ontem não pode ficar pendurado', () => {


    expect(patchDiagOnline(null, AGORA).last_error).toBeNull();
  });

  it('erro real é gravado como texto', () => {
    expect(patchDiagOnline('invalid_grant', AGORA))
      .toEqual({ last_check_at: AGORA, last_error: 'invalid_grant' });
  });

  it('sempre carimba last_check_at, inclusive no sucesso', () => {
    expect(patchDiagOnline('', AGORA).last_check_at).toBe(AGORA);
    expect(patchDiagOnline('invalid_grant', AGORA).last_check_at).toBe(AGORA);
  });

  it('não devolve chave a mais (o update é um patch estreito)', () => {
    expect(Object.keys(patchDiagOnline('x', AGORA)).sort())
      .toEqual(['last_check_at', 'last_error']);
  });
});
