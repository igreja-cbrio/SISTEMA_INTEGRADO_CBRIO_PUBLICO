












const dig = (v) => String(v || '').replace(/\D/g, '');
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();






function chavePessoa(linha) {
  const c = dig(linha.cpf_norm);
  if (c.length === 11) return 'cpf:' + c;
  const t = dig(linha.telefone_norm);
  if (t.length >= 10) return 'tel:' + t;
  const n = norm(linha.nome_display);
  return n ? 'nome:' + n : 'ref:' + linha.ref_id;
}







const PORTA_VINCULO = Object.freeze({
  next: { tabela: 'next_matriculas', col: 'membro_id' },
  voluntariado: { tabela: 'vol_inscricoes', col: 'membro_id' },
  inscricoes: { tabela: 'inscricoes', col: 'membro_id' },
  eventos_externos: { tabela: 'ext_inscricoes', col: 'membro_id' },
  batismo: { tabela: 'batismo_inscricoes', col: 'membro_id' },
  grupos: { tabela: 'mem_grupo_pedidos', col: 'membro_id' },
  grupos_lider: { tabela: 'mem_lider_inscricoes', col: 'membro_id' },
  apresentacao_criancas: { tabela: 'apresentacao_criancas', col: 'responsavel_membro_id' },
  apresentacao_bebes: { tabela: 'apresentacao_bebes', col: 'responsavel_membro_id' },
});

const COLUNAS_ORFA = 'porta,ref_id,membro_id,nome_display,telefone_norm,cpf_norm,email_norm,nascimento,criado_em,evento_rotulo';





async function lerLinhasOrfas(supabase, colunas = COLUNAS_ORFA) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase.from('vw_inscricoes_unificadas')
      .select(colunas).is('membro_id', null).range(off, off + 999);
    if (error) throw new Error('vw_inscricoes_unificadas: ' + error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}


function agruparPorPessoa(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const k = chavePessoa(l);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(l);
  }
  for (const ls of mapa.values()) ls.sort(ordemAncora);
  return mapa;
}





function ordemAncora(a, b) {
  const d = dig(b.cpf_norm).length - dig(a.cpf_norm).length;
  if (d !== 0) return d;
  return String(b.criado_em || '').localeCompare(String(a.criado_em || ''));
}

















const FORCA = Object.freeze({ CPF: 'forte_cpf', TEL_NOME: 'forte_telefone_nome', MANUAL: 'manual' });






function avaliarForcaOrfa(insc, cad) {
  if (!insc || !cad) return { forca: FORCA.MANUAL, motivo: 'sem dados dos dois lados', veto: null };




  const nInsc = String(insc.nascimento || '').slice(0, 10);
  const nCad = String(cad.data_nascimento || '').slice(0, 10);
  if (nInsc && nCad && nInsc !== nCad) {
    return { forca: FORCA.MANUAL, motivo: 'nascimento divergente entre a inscrição e o cadastro', veto: 'nascimento_divergente' };
  }

  const cpfInsc = dig(insc.cpf_norm);
  const cpfCad = dig(cad.cpf);



  if (cpfInsc.length === 11 && cpfCad.length === 11 && cpfInsc !== cpfCad) {
    return { forca: FORCA.MANUAL, motivo: 'a inscrição trouxe CPF diferente do CPF do cadastro', veto: 'cpf_divergente' };
  }
  if (cpfInsc.length === 11 && cpfInsc === cpfCad) {
    return { forca: FORCA.CPF, motivo: 'o CPF da inscrição é o CPF do cadastro', veto: null };
  }

  const telInsc = dig(insc.telefone_norm);
  const telCad = dig(cad.telefone);
  const nomeInsc = norm(insc.nome_display);
  const nomeCad = norm(cad.nome);


  if (telInsc.length >= 10 && telInsc === telCad && nomeInsc && nomeInsc === nomeCad) {
    return { forca: FORCA.TEL_NOME, motivo: 'mesmo telefone e nome completo idêntico', veto: null };
  }

  if (telInsc.length >= 10 && telInsc === telCad) {
    return { forca: FORCA.MANUAL, motivo: 'telefone igual mas o nome não é o mesmo — telefone é compartilhado em família', veto: null };
  }
  return { forca: FORCA.MANUAL, motivo: 'sem chave forte em comum — confira antes de ligar', veto: null };
}

const forcaPodeLote = (f) => f === FORCA.CPF || f === FORCA.TEL_NOME;

module.exports = {
  chavePessoa, PORTA_VINCULO, COLUNAS_ORFA, lerLinhasOrfas, agruparPorPessoa,
  ordemAncora, digitosOrfa: dig, normOrfa: norm,
  FORCA, avaliarForcaOrfa, forcaPodeLote,
};
