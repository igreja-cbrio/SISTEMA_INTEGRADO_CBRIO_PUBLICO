import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mascararNome, validarEntrada, escolherInscricao, resumoPublico,
  normalizarNomeChave, telefoneChave, validarEntradaNome, escolherPorNomeTelefone,
} from '../../backend/utils/checkinAutoatendimento.js';
import {
  gerarTokenCheckin, verificarTokenCheckin, montarLinkCheckin,
} from '../../backend/utils/eventoCheckinToken.js';
import { gerarTokenCulto } from '../../backend/utils/cultoToken.js';

const EVENTO = '11111111-2222-3333-4444-555555555555';

function comSegredo<T>(fn: () => T): T {
  const antes = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'segredo-de-teste';
  try { return fn(); } finally {
    if (antes === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = antes;
  }
}

describe('checkinAutoatendimento · a porta pública do check-in', () => {
  it('⚠️ o nome sai MASCARADO — primeiro nome e iniciais', () => {
    expect(mascararNome('Marino Teorico de Amostral')).toBe('Marino T. D. A.');
    expect(mascararNome('Maria da Silva Souza')).toBe('Maria D. S. S.');
  });

  it('nome de uma palavra sai inteiro, e vazio não estoura', () => {
    expect(mascararNome('Ana')).toBe('Ana');
    expect(mascararNome('   ')).toBe('');
    expect(mascararNome(null as any)).toBe('');
  });

  it('⚠️ a máscara NUNCA devolve o sobrenome inteiro', () => {
    const m = mascararNome('Marino Teorico');
    expect(m).not.toContain('Teorico');
    expect(m).toBe('Marino T.');
  });

  it('exige CPF completo e nascimento válido', () => {
    expect(validarEntrada({ cpf: '123.456.789-01', nascimento: '1990-05-10' }))
      .toEqual({ ok: true, cpf: '12345678901', nascimento: '1990-05-10' });
    expect(validarEntrada({ cpf: '123', nascimento: '1990-05-10' }).ok).toBe(false);
    expect(validarEntrada({ cpf: '12345678901', nascimento: '10/05/1990' }).ok).toBe(false);
    expect(validarEntrada({ cpf: '12345678901', nascimento: '1990-13-10' }).ok).toBe(false);
    expect(validarEntrada({}).ok).toBe(false);
  });

  it('acha a inscrição quando o nascimento confere', () => {
    const r = escolherInscricao([{ id: 'a', data_nascimento: '1990-05-10' }], '1990-05-10');
    expect(r.situacao).toBe('ok');
    expect(r.inscricao.id).toBe('a');
  });

  it('⚠️ nascimento que NÃO confere não entra — é o segundo sinal', () => {
    expect(escolherInscricao([{ id: 'a', data_nascimento: '1990-05-10' }], '1991-05-10').situacao)
      .toBe('nao_encontrada');
  });

  it('⚠️ inscrição SEM nascimento não casa com nada', () => {


    expect(escolherInscricao([{ id: 'a', data_nascimento: null }], '1990-05-10').situacao)
      .toBe('nao_encontrada');
    expect(escolherInscricao([{ id: 'a' }], '1990-05-10').situacao).toBe('nao_encontrada');
  });

  it('⚠️ duas inscrições iguais viram AMBÍGUO, não um chute', () => {
    const r = escolherInscricao(
      [{ id: 'a', data_nascimento: '1990-05-10' }, { id: 'b', data_nascimento: '1990-05-10' }],
      '1990-05-10',
    );
    expect(r.situacao).toBe('ambiguo');
    expect(r.inscricao).toBeUndefined();
  });

  it('lista vazia ou lixo não estoura', () => {
    expect(escolherInscricao([], '1990-05-10').situacao).toBe('nao_encontrada');
    expect(escolherInscricao(null as any, '1990-05-10').situacao).toBe('nao_encontrada');
    expect(escolherInscricao([null as any], '1990-05-10').situacao).toBe('nao_encontrada');
  });

  it('⚠️⚠️ o resumo público NÃO vaza contato, CPF nem número de sorte', () => {
    const r = resumoPublico({
      id: 'x', nome_completo: 'Marino Teorico', data_nascimento: '1990-05-10',
      telefone: '21999998888', email: 'a@b.com', cpf: '12345678901',
      numero_sorte: 1817, valor_cobrado_centavos: 83000, checkin_em: null,
    });
    expect(Object.keys(r!).sort()).toEqual(['id', 'ja_fez_checkin', 'nome_mascarado']);
    const txt = JSON.stringify(r);
    for (const vaz of ['21999998888', 'a@b.com', '12345678901', '1817', '83000', 'Teorico']) {
      expect(txt).not.toContain(vaz);
    }
  });

  it('o resumo avisa quando a pessoa já fez check-in', () => {
    expect(resumoPublico({ id: 'x', nome_completo: 'Ana', checkin_em: '2026-08-29T12:00:00Z' })!.ja_fez_checkin).toBe(true);
    expect(resumoPublico(null)).toBeNull();
  });
});

describe('eventoCheckinToken · o QR da porta', () => {
  it('assina e volta o mesmo evento', () => comSegredo(() => {
    const t = gerarTokenCheckin(EVENTO);
    expect(verificarTokenCheckin(t)).toBe(EVENTO);
  }));

  it('⚠️⚠️ token de OUTRO fluxo (mesmo segredo) é recusado — namespace', () => comSegredo(() => {
    expect(verificarTokenCheckin(gerarTokenCulto(EVENTO))).toBeNull();
  }));

  it('assinatura adulterada é recusada', () => comSegredo(() => {
    const t = gerarTokenCheckin(EVENTO)!;
    const [id, sig] = t.split('.');
    const trocado = sig[0] === 'a' ? 'b' : 'a';
    expect(verificarTokenCheckin(`${id}.${trocado}${sig.slice(1)}`)).toBeNull();
  }));

  it('lixo é recusado sem estourar', () => comSegredo(() => {
    for (const v of ['', 'abc', 'abc.def', `${'0'.repeat(32)}.${'0'.repeat(20)}`, null as any]) {
      expect(verificarTokenCheckin(v)).toBeNull();
    }
  }));

  it('⚠️ FAIL-CLOSED: sem segredo não gera nem aceita', () => {
    const cron = process.env.CRON_SECRET;
    const own = process.env.EVENTO_CHECKIN_TOKEN_SECRET;
    const valido = comSegredo(() => gerarTokenCheckin(EVENTO))!;
    delete process.env.CRON_SECRET;
    delete process.env.EVENTO_CHECKIN_TOKEN_SECRET;
    try {
      expect(gerarTokenCheckin(EVENTO)).toBeNull();
      expect(montarLinkCheckin(EVENTO)).toBeNull();
      expect(verificarTokenCheckin(valido)).toBeNull();
    } finally {
      if (cron !== undefined) process.env.CRON_SECRET = cron;
      if (own !== undefined) process.env.EVENTO_CHECKIN_TOKEN_SECRET = own;
    }
  });

  it('⚠️⚠️ o segredo NUNCA tem literal de fallback (lição do MEM_QR_SALT)', () => {






    const fonte = readFileSync(
      join(__dirname, '..', '..', 'backend', 'utils', 'eventoCheckinToken.js'), 'utf8',
    );



    const semComentario = fonte
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
    const corpo = /function segredo\(\)\s*\{([\s\S]*?)\n\}/.exec(semComentario)?.[1] ?? '';
    expect(corpo).toContain('process.env');

    expect(corpo).not.toMatch(/\|\|\s*['"`]/);
  });

  it('o link aponta para /ec/', () => comSegredo(() => {
    expect(montarLinkCheckin(EVENTO)).toMatch(/\/ec\/[0-9a-f]{32}\.[0-9a-f]{20}$/);
  }));
});









describe('autoatendimento · nome completo + telefone', () => {
  const ANA = { id: 'a', nome_completo: 'Ana Paula Limoal da Silva', telefone: '21999998888', status: 'confirmada' };
  const JOAO = { id: 'b', nome_completo: 'João Mário Conceitual', telefone: '21988887777', status: 'confirmada' };




  it('a pessoa não precisa acertar acento nem caixa', () => {
    expect(normalizarNomeChave('JOÃO MÁRIO CONCEITUAL')).toBe('joao mario conceitual');
    expect(normalizarNomeChave('joao mario conceitual')).toBe('joao mario conceitual');
    expect(normalizarNomeChave('JOSÉ  DA  Conceitual')).toBe('jose da conceitual');
  });




  it('casa nos DOIS sentidos: cadastro sem acento × digitado com acento', () => {
    expect(normalizarNomeChave('ANDRE MARINO PEREIRAL'))
      .toBe(normalizarNomeChave('André Marino Pereiral'));
  });

  it('tolera espaço duplo, pontas e pontuação', () => {
    expect(normalizarNomeChave('  Ana   Paula ')).toBe('ana paula');


    expect(normalizarNomeChave('João P. Silva')).toBe(normalizarNomeChave('Joao P Silva'));
    expect(normalizarNomeChave('D’Ávila Costa')).toBe(normalizarNomeChave("D'Avila Costa"));

    expect(normalizarNomeChave('Maria(Ana) Souza')).toBe('maria ana souza');

    expect(normalizarNomeChave('Robērta Lima')).toBe('roberta lima');
  });

  it('casa o telefone com ou sem o 9, o DDD ou o +55', () => {
    expect(telefoneChave('5521999998888')).toBe('99998888');
    expect(telefoneChave('21999998888')).toBe('99998888');
    expect(telefoneChave('(21) 99999-8888')).toBe('99998888');
  });



  it('não confunde o DDI 55 com o DDD 55', () => {
    expect(telefoneChave('5599998888')).toBe('99998888');
    expect(telefoneChave('55999998888')).toBe('99998888');
  });

  it('exige nome com 2+ palavras', () => {
    expect(validarEntradaNome({ nome: 'Ana', telefone: '21999998888' }).ok).toBe(false);
    expect(validarEntradaNome({ nome: 'Ana', telefone: '21999998888' }).motivo).toBe('nome_incompleto');
    expect(validarEntradaNome({ nome: 'Ana Paula', telefone: '21999998888' }).ok).toBe(true);
  });

  it('exige telefone de 10 a 11 dígitos', () => {
    expect(validarEntradaNome({ nome: 'Ana Paula', telefone: '99998888' }).motivo).toBe('telefone_invalido');
    expect(validarEntradaNome({ nome: 'Ana Paula', telefone: '2199999888812' }).motivo).toBe('telefone_invalido');
    expect(validarEntradaNome({ nome: 'Ana Paula', telefone: '2199998888' }).ok).toBe(true);
  });

  it('acha a inscrição quando nome E telefone casam', () => {
    const r = escolherPorNomeTelefone([ANA, JOAO], { nome: 'ana paula limoal da silva', telefone: '(21) 99999-8888' });
    expect(r.situacao).toBe('ok');
    expect(r.inscricao.id).toBe('a');
  });



  it('acha mesmo digitando sem acento, em caixa alta e com espaço extra', () => {
    const r = escolherPorNomeTelefone([ANA, JOAO], { nome: '  JOAO   MARIO CONCEITUAL ', telefone: '21988887777' });
    expect(r.situacao).toBe('ok');
    expect(r.inscricao.id).toBe('b');
  });




  it('recusa nome certo com telefone errado', () => {
    expect(escolherPorNomeTelefone([ANA, JOAO], { nome: 'Ana Paula Limoal da Silva', telefone: '21911112222' }).situacao)
      .toBe('nao_encontrada');
  });



  it('recusa nome parcial mesmo com o telefone certo', () => {
    expect(escolherPorNomeTelefone([ANA], { nome: 'Ana Paula', telefone: '21999998888' }).situacao)
      .toBe('nao_encontrada');
    expect(escolherPorNomeTelefone([ANA], { nome: 'Ana', telefone: '21999998888' }).situacao)
      .toBe('nao_encontrada');
  });

  it('duas iguais viram ambíguo e vão pro operador', () => {
    const gemea = { ...ANA, id: 'c' };
    expect(escolherPorNomeTelefone([ANA, gemea], { nome: 'Ana Paula Limoal da Silva', telefone: '21999998888' }).situacao)
      .toBe('ambiguo');
  });

  it('entrada vazia não casa com nada', () => {
    expect(escolherPorNomeTelefone([ANA], { nome: '', telefone: '' }).situacao).toBe('nao_encontrada');
    expect(escolherPorNomeTelefone([ANA], { nome: 'Ana Paula Limoal da Silva', telefone: '' }).situacao)
      .toBe('nao_encontrada');
  });


  it('o resumo do 2º caminho continua mascarado e sem contato', () => {
    const r = resumoPublico(escolherPorNomeTelefone([ANA], { nome: 'Ana Paula Limoal da Silva', telefone: '21999998888' }).inscricao);
    expect(r.nome_mascarado).toBe('Ana P. L. D. S.');
    expect(JSON.stringify(r)).not.toContain('21999998888');
    expect(JSON.stringify(r)).not.toContain('Limoal');
  });
});
