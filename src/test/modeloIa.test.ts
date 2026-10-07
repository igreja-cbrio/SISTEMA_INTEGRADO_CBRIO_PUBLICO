import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  CADEIA_PADRAO, cadeiaDeModelos, ehModeloInexistente, mensagemParaUsuario, modeloProvado,
} from '../../backend/utils/modeloIa.js';


const ERRO_REAL = { type: 'not_found_error', message: 'model: claude-sonnet-4-20250514' };

describe('ehModeloInexistente · só ISSO justifica trocar de modelo', () => {
  it('reconhece o erro real que derrubou o assistente', () => {
    expect(ehModeloInexistente(ERRO_REAL)).toBe(true);
  });

  it('⚠️⚠️ crédito, auth e rate limit NÃO são motivo para tentar outro modelo', () => {


    expect(ehModeloInexistente({ type: 'authentication_error', message: 'invalid x-api-key' })).toBe(false);
    expect(ehModeloInexistente({ type: 'rate_limit_error', message: 'rate limit' })).toBe(false);
    expect(ehModeloInexistente({ type: 'overloaded_error', message: 'overloaded' })).toBe(false);
    expect(ehModeloInexistente({ type: 'invalid_request_error', message: 'credit balance is too low' })).toBe(false);
  });

  it('⚠️ "not found" que não fala de MODELO não conta', () => {
    expect(ehModeloInexistente({ type: 'invalid_request_error', message: 'file not found' })).toBe(false);
  });

  it('erro nulo não quebra', () => {
    expect(ehModeloInexistente(null)).toBe(false);
    expect(ehModeloInexistente(undefined)).toBe(false);
  });
});

describe('cadeiaDeModelos', () => {
  it('⚠️⚠️ o ÚLTIMO degrau é o modelo PROVADO — é ele que garante resposta', () => {
    expect(CADEIA_PADRAO[CADEIA_PADRAO.length - 1]).toBe('claude-haiku-4-5-20251001');
    expect(modeloProvado()).toBe('claude-haiku-4-5-20251001');
  });

  it('a cadeia tem mais de um degrau (senão não há queda)', () => {
    expect(cadeiaDeModelos().length).toBeGreaterThan(1);
  });

  it('⚠️⚠️ env preferida entra NA FRENTE, nunca APAGA os degraus', () => {


    const c = cadeiaDeModelos('modelo-experimental');
    expect(c[0]).toBe('modelo-experimental');
    expect(c).toContain('claude-haiku-4-5-20251001');
  });

  it('preferido já presente não duplica', () => {
    const c = cadeiaDeModelos('claude-haiku-4-5-20251001');
    expect(c.filter((m) => m === 'claude-haiku-4-5-20251001')).toHaveLength(1);
  });

  it('env vazia devolve a cadeia padrão', () => {
    expect(cadeiaDeModelos('')).toEqual(CADEIA_PADRAO);
    expect(cadeiaDeModelos(undefined)).toEqual(CADEIA_PADRAO);
  });
});

describe('mensagemParaUsuario · o erro cru NUNCA vai para a tela', () => {
  it('⚠️⚠️ não vaza o ID do modelo nem o texto da API', () => {


    const m = mensagemParaUsuario(ERRO_REAL);


    expect(m).not.toContain('claude');
    expect(m).not.toContain(ERRO_REAL.message);
    expect(m).not.toMatch(/not_found|error/i);
    expect(m.length).toBeGreaterThan(20);
  });

  it('cada tipo de erro vira um recado diferente e ACIONÁVEL', () => {
    expect(mensagemParaUsuario({ type: 'rate_limit_error' })).toMatch(/segundos|tente/i);
    expect(mensagemParaUsuario({ type: 'authentication_error' })).toMatch(/equipe/i);
    expect(mensagemParaUsuario({ type: 'overloaded_error' })).toMatch(/instantes|sobrecarregada/i);
  });

  it('erro desconhecido ainda dá recado humano', () => {
    const m = mensagemParaUsuario({ type: 'coisa_nova', message: 'x' });
    expect(m).toMatch(/não consegui/i);
  });
});

describe('⚠️⚠️ guarda: o modelo descontinuado não volta ao código', () => {
  it('nenhum arquivo do backend usa claude-sonnet-4-20250514 como modelo', () => {
    const RAIZ = resolve(__dirname, '../..');
    const ARQUIVOS = [
      'backend/routes/agents.js',
      'backend/routes/reports.js',
      'backend/services/agentService.js',
    ];
    const problemas: string[] = [];
    for (const rel of ARQUIVOS) {
      const linhas = readFileSync(resolve(RAIZ, rel), 'utf8').split('\n');
      linhas.forEach((l, i) => {



        const semComentario = l.replace(/(^|[^:])\/\/[^\n]*$/, '$1').replace(/\/\*[^\n]*?\*\//g, '');
        if (/^\s*\*/.test(l)) return;





        if (/model\s*[:=]/.test(semComentario) && semComentario.includes('claude-sonnet-4-20250514')) {
          problemas.push(`${rel}:${i + 1}`);
        }
      });
    }
    expect(problemas, `modelo descontinuado de volta em:\n${problemas.join('\n')}`).toEqual([]);
  });
});
