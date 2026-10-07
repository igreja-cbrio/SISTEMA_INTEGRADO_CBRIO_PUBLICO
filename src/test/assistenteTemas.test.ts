import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const T = require('../../backend/utils/assistenteTemas.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { erroCurto } = require('../../backend/services/assistenteTemas.js');

const RAIZ = join(__dirname, '..', '..');
const ler = (p: string) => semComentariosJs(readFileSync(join(RAIZ, p), 'utf8'));

describe('temas do assistente · o que entra no modelo', () => {
  it('só fala da pessoa e do assistente; turno de sistema e lixo ficam de fora', () => {
    const t = T.normalizarTurnos([
      { role: 'system', texto: 'prompt inteiro com contexto' },
      { role: 'user', texto: '  Como   aprovo uma compra? ' },
      { role: 'assistant', texto: 'Vá em Staff › Solicitações.' },
      { role: 'tool', texto: 'x' },
      { role: 'user', texto: '' },
      null,
    ]);
    expect(t).toEqual([
      { role: 'user', texto: 'Como aprovo uma compra?' },
      { role: 'assistant', texto: 'Vá em Staff › Solicitações.' },
    ]);
  });

  it('conversa longa mantém o FIM (é ele que diz se resolveu)', () => {
    const muitas = Array.from({ length: 30 }, (_, i) => ({ role: 'user', texto: `${i} `.padEnd(1000, 'x') }));
    const t = T.normalizarTurnos(muitas);
    expect(t.length).toBeLessThan(30);
    expect(t[t.length - 1].texto.startsWith('29')).toBe(true);
  });

  it('entrada que não é lista vira lista vazia', () => {
    expect(T.normalizarTurnos('texto')).toEqual([]);
    expect(T.temFalaDaPessoa([{ role: 'assistant', texto: 'oi' }])).toBe(false);
  });

  it('⚠️ assunto pastoral em qualquer fala: a conversa nem vai ao modelo', () => {
    expect(T.conversaSensivel([{ role: 'user', texto: 'Estou passando por um divórcio' }])).toBe(true);
    expect(T.conversaSensivel([{ role: 'user', texto: 'Como cadastro um voluntário?' }])).toBe(false);
  });

  it('⚠️ CPF, telefone e e-mail saem mascarados antes do modelo', () => {
    const texto = T.transcricaoParaModelo([{ role: 'user', texto: 'CPF 123.456.789-00, tel 21999998888, ana@exemplo.com' }]);
    expect(texto).not.toMatch(/123\.456|21999998888|ana@exemplo/);
    expect(texto).toMatch(/\[cpf\]/);
    expect(texto).toMatch(/^Pessoa: /);
  });
});

describe('temas do assistente · o que fica no banco', () => {
  it('tema, tipo e resolvido de fora da lista caem no valor neutro', () => {
    expect(T.normalizarClassificacao({ tema: 'hackeado', tipo: 'x', resolvido: 'talvez', resumo: 'ok' }))
      .toMatchObject({ tema: 'outro', tipo: 'outro', resolvido: 'indefinido' });
    expect(T.normalizarClassificacao(null)).toMatchObject({ tema: 'outro', resumo: null });
  });

  it('⚠️ resumo com número, e-mail ou dado mascarado é jogado fora', () => {
    expect(T.resumoSeguro('como cadastrar um voluntário')).toBe('como cadastrar um voluntário');
    expect(T.resumoSeguro('ligar para 21999998888')).toBeNull();
    expect(T.resumoSeguro('mandar para ana@exemplo.com')).toBeNull();
    expect(T.resumoSeguro('pedido 20260018')).toBeNull();
    expect(T.resumoSeguro('')).toBeNull();
    expect((T.resumoSeguro('a'.repeat(500)) || '').length).toBe(140);
  });

  it('⚠️ o nome de quem fala sai da transcrição antes do modelo (inclusive em maiúsculas e sem acento)', () => {
    const texto = T.transcricaoParaModelo([{ role: 'assistant', texto: 'Oi, Marino! Tudo bem, MARINO? Fale, José.' }], { nomePessoa: 'Marino José da Silva' });
    expect(texto).toBe('Assistente: Oi, [pessoa]! Tudo bem, [pessoa]? Fale, [pessoa].');
  });

  it('⚠️ resumo com o nome de quem falou ou de outra pessoa é descartado', () => {
    const nome = { nomePessoa: 'Marino Teorico' };
    expect(T.resumoSeguro('Marino quer saber como aprovar a compra', nome)).toBeNull();
    expect(T.resumoSeguro('como liberar acesso para marino', nome)).toBeNull();
    expect(T.resumoSeguro('como cadastrar a Sandra Carolina na equipe', nome)).toBeNull();
    expect(T.resumoSeguro('dar acesso ao [pessoa] no financeiro', nome)).toBeNull();
  });

  it('nomes de telas, módulos e siglas continuam valendo no resumo', () => {
    expect(T.resumoSeguro('onde fica o Dashboard Semanal')).toBe('onde fica o Dashboard Semanal');
    expect(T.resumoSeguro('como corrigir o CPF na Membresia')).toBe('como corrigir o CPF na Membresia');
    expect(T.resumoSeguro('Como abrir o Painel CBRio. Onde fica a ATA Semanal')).toBe('Como abrir o Painel CBRio. Onde fica a ATA Semanal');
  });

  it('a ferramenta do modelo usa as MESMAS listas que a normalização', () => {
    const p = T.TOOL_CLASSIFICAR.input_schema.properties;
    expect(p.tema.enum).toEqual(T.SLUGS_TEMAS);
    expect(p.tipo.enum).toEqual([...T.TIPOS]);
    expect(p.resolvido.enum).toEqual([...T.RESOLVIDO]);
  });

  it('o agregado nunca devolve campo que identifique alguém', () => {
    const r = T.agregarTemas([
      { status: 'classificado', tema: 'voluntariado', tipo: 'como_fazer', resolvido: 'nao', resumo: 'como cadastrar voluntário', tela_rotulo: 'Voluntários', dia: '2026-10-05' },
      { status: 'classificado', tema: 'voluntariado', tipo: 'onde_fica', resolvido: 'sim', resumo: 'onde fica a escala', tela_rotulo: 'Voluntariado', dia: '2026-10-05' },
      { status: 'descartado', dia: '2026-10-05' },
      { status: 'erro', dia: '2026-10-05' },
    ]);
    expect(r.totais).toEqual({ conversas: 4, classificadas: 2, descartadas_sensiveis: 1, com_erro: 1, nao_resolvidas: 1 });
    expect(r.por_tema[0]).toMatchObject({ tema: 'voluntariado', rotulo: 'Voluntariado', total: 2, nao_resolvidas: 1 });
    expect(r.lacunas).toEqual([{ dia: '2026-10-05', tema: 'Voluntariado', resumo: 'como cadastrar voluntário', resolvido: 'nao' }]);
    expect(JSON.stringify(r)).not.toMatch(/user_id|profile_id|email|nome/);
  });

  it('dia é o de Brasília (23h30 BRT de domingo ainda é domingo)', () => {
    expect(T.diaBrt(new Date('2026-10-06T02:30:00Z'))).toBe('2026-10-05');
  });

  it('a conversa é guardada por hash, nunca pelo id que reabre a transcrição na Tavus', () => {
    expect(T.hashConversa('c123')).toMatch(/^[0-9a-f]{64}$/);
    expect(T.hashConversa('c123')).toBe(T.hashConversa('c123'));
    expect(T.hashConversa('c123')).not.toContain('c123');
  });

  it('erro gravado é um código curto, sem trecho da conversa', () => {
    expect(erroCurto(new Error('Your credit balance is too low'))).toBe('anthropic_sem_credito');
    expect(erroCurto(new Error('Request timed out'))).toBe('modelo_timeout');
    expect(erroCurto(new Error('qualquer coisa com o nome Fulano'))).toBe('modelo_falhou');
  });
});

describe('temas do assistente · guardas estáticas', () => {
  it('a rota é só de super-admin, autenticada e montada no servidor', () => {
    const rota = ler('backend/routes/assistenteConversas.js');
    expect(rota).toMatch(/router\.use\(authenticate\);\s*router\.use\(requireSuperAdmin\);/);
    expect(ler('backend/server.js')).toMatch(/app\.use\('\/api\/assistente-conversas', require\('\.\/routes\/assistenteConversas'\)\)/);
  });

  it('a gravação é AWAITED (serverless congela ao responder)', () => {
    expect(ler('backend/routes/assistenteConversas.js')).toMatch(/await registrarConversaVideo\(/);
  });

  it('o ON CONFLICT usa a mesma chave da UNIQUE não parcial da migration', () => {
    expect(ler('backend/services/assistenteTemas.js')).toMatch(/onConflict: 'canal,conversa_hash'/);
    const sql = readFileSync(join(RAIZ, 'supabase/migrations/20261005200000_assistente_conversa_temas.sql'), 'utf8');
    expect(sql).toMatch(/UNIQUE \(canal, conversa_hash\)/);
    expect(sql).not.toMatch(/\b(user_id|profile_id|membro_id)\b\s+uuid/);
    expect(sql).toMatch(/REVOKE ALL ON public\.assistente_conversa_temas FROM anon, authenticated/);
  });

  it('a retenção pega carona no cron de notificações, em bloco protegido', () => {
    const cron = ler('backend/routes/notificacoes.js');
    expect(cron).toMatch(/try \{\s*const \{ expurgarTemasAntigos \} = require\('\.\.\/services\/assistenteTemas'\);\s*temasAssistente = await expurgarTemasAntigos\(\);\s*\} catch/);
  });
});
