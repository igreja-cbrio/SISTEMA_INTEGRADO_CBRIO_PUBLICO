


























const ei = require('../utils/eInscricao');


const CAMPOS_CONTRATO = [
  ['cpf', 'CPF'],
  ['telefone', 'telefone'],
  ['email', 'e-mail'],
  ['data_nascimento', 'data de nascimento'],
  ['sexo', 'gênero'],
];


function idadeEmAnos(nascimento, agora = new Date()) {
  if (!nascimento) return null;
  const m = String(nascimento).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  let anos = agora.getUTCFullYear() - Number(m[1]);
  const mesDia = (agora.getUTCMonth() + 1) * 100 + agora.getUTCDate();
  if (mesDia < Number(m[2]) * 100 + Number(m[3])) anos -= 1;
  return anos;
}








function alertasDaLinha(linha, agora = new Date()) {
  const alertas = [...(linha.avisos || [])];
  const idade = idadeEmAnos(linha.data_nascimento, agora);
  if (idade != null && idade < 18 && !linha.responsavel_nome) alertas.push('menor sem responsável na planilha');
  if (idade != null && (idade < 5 || idade > 90)) alertas.push(`idade ${idade} anos — conferir a data de nascimento`);
  return alertas;
}















function planejar(linhas, vivas, { keysEvento = null, agora = new Date() } = {}) {
  const porCpf = new Map();
  const porCodigo = new Map();
  for (const v of vivas || []) {
    if (v?.cpf && !porCpf.has(v.cpf)) porCpf.set(v.cpf, v);
    const cod = v?.dados?.e_inscricao?.codigo;
    if (cod && !porCodigo.has(cod)) porCodigo.set(cod, v);
  }


  const noArquivo = new Map();

  const inserir = []; const cancelar = []; const pular = []; const invalidas = [];
  const keysDesconhecidas = new Set();

  for (const l of linhas || []) {
    const ja = (l.codigo_plataforma && porCodigo.get(l.codigo_plataforma))
      || (l.cpf && porCpf.get(l.cpf));

    if (l.status === 'cancelada') {
      if (ja && ja.status !== 'cancelada' && ja.origem === ei.ORIGEM_E_INSCRICAO) {
        cancelar.push({ linha: l, existente: ja });
      } else {
        pular.push({ linha: l, motivo: ja ? 'cancelada lá e aqui também' : 'cancelada lá e nunca entrou aqui' });
      }
      continue;
    }
    if (ja) {
      pular.push({ linha: l, motivo: `já está no sistema (${ja.codigo} · ${ja.status})`, existente: ja });
      continue;
    }
    const chaveArquivo = l.codigo_plataforma || l.cpf;
    if (chaveArquivo && noArquivo.has(chaveArquivo)) {
      pular.push({ linha: l, motivo: 'linha repetida na própria planilha' });
      continue;
    }

    const faltam = CAMPOS_CONTRATO.filter(([campo]) => !l[campo]).map(([, rotulo]) => rotulo);
    if (faltam.length) { invalidas.push({ linha: l, faltam }); continue; }

    if (keysEvento) {
      for (const k of Object.keys(l.dados || {})) {
        if (k !== 'e_inscricao' && !keysEvento.has(k)) keysDesconhecidas.add(k);
      }
    }
    if (chaveArquivo) noArquivo.set(chaveArquivo, l);
    inserir.push({ linha: l, alertas: alertasDaLinha(l, agora) });
  }

  const bruto = inserir.reduce((s, x) => s + (x.linha.dados?.e_inscricao?.valor_bruto_centavos || 0), 0);
  const liquido = inserir.reduce((s, x) => s + (x.linha.valor_cobrado_centavos || 0), 0);

  return {
    inserir,
    cancelar,
    pular,
    invalidas,
    keys_desconhecidas: [...keysDesconhecidas],
    total_linhas: (linhas || []).length,
    dinheiro: { bruto_centavos: bruto, liquido_centavos: liquido, taxa_pct: ei.TAXA_E_INSCRICAO_PCT },
  };
}









async function executar({ supabase, acharOuCriarGuardado, eventoId, plano }) {
  const inseridas = []; const canceladas = []; const erros = [];
  let ligados = 0; let criados = 0; let semVinculo = 0;





  let parceira = false;
  {
    const { data: evIg, error: eIg } = await supabase.from('insc_eventos')
      .select('igreja_id, igreja:igrejas(tipo)').eq('id', eventoId).maybeSingle();
    parceira = Boolean(eIg) || evIg?.igreja?.tipo === 'cba_acompanhada';
  }

  for (const { linha } of plano.inserir) {
    const { avisos, codigo_plataforma: _cod, ...row } = linha;
    const { data: ins, error } = await supabase.from('inscricoes')
      .insert({ ...row, evento_id: eventoId, whatsapp_optin: false })
      .select('id, codigo').single();
    if (error) { erros.push({ nome: linha.nome_completo, erro: error.message }); continue; }

    let r = null;
    if (parceira) {
      semVinculo += 1;
      inseridas.push({
        id: ins.id, codigo: ins.codigo, nome: linha.nome_completo,
        codigo_plataforma: linha.dados?.e_inscricao?.codigo || null,
        valor_centavos: linha.valor_cobrado_centavos, vinculo: 'igreja parceira · sem vínculo',
      });
      continue;
    }
    try {
      r = await acharOuCriarGuardado({
        cpf: linha.cpf, email: linha.email, telefone: linha.telefone, nome: linha.nome_completo,
        dataNascimento: linha.data_nascimento, genero: linha.sexo, status: 'visitante',
        extra: { data_nascimento: linha.data_nascimento },
        origem: 'inscricoes_e_inscricao', origemId: ins.id,
      });
    } catch (e) {
      erros.push({ nome: linha.nome_completo, erro: `vínculo: ${e.message}`, apenas_vinculo: true });
    }
    let vinculo = 'sem vínculo';
    if (r?.membro_id) {
      const { error: eM } = await supabase.from('inscricoes')
        .update({ membro_id: r.membro_id }).eq('id', ins.id).is('membro_id', null);
      if (eM) {
        erros.push({ nome: linha.nome_completo, erro: `gravar vínculo: ${eM.message}`, apenas_vinculo: true });
        semVinculo++;
      } else if (r.created) { criados++; vinculo = 'cadastro criado'; } else { ligados++; vinculo = `ligado (${r.matched_by})`; }
    } else semVinculo++;

    inseridas.push({
      id: ins.id, codigo: ins.codigo, nome: linha.nome_completo,
      codigo_plataforma: linha.dados?.e_inscricao?.codigo || null,
      valor_centavos: linha.valor_cobrado_centavos, vinculo,
    });
  }

  for (const { linha, existente } of plano.cancelar) {
    const { error } = await supabase.from('inscricoes')
      .update({ status: 'cancelada' }).eq('id', existente.id).neq('status', 'cancelada');
    if (error) erros.push({ nome: linha.nome_completo, erro: `cancelar: ${error.message}` });
    else canceladas.push({ id: existente.id, codigo: existente.codigo, nome: linha.nome_completo });
  }

  return { inseridas, canceladas, ligados, criados, sem_vinculo: semVinculo, erros };
}

module.exports = { planejar, executar, alertasDaLinha, idadeEmAnos, CAMPOS_CONTRATO };
