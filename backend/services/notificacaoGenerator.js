const { supabase } = require('../utils/supabase');
const { donosDeVariosGrupos } = require('./gruposDestinatarios');
const { notificar } = require('./notificar');
const { calcularDepreciacao } = require('../utils/patrimonioDepreciacao');



const { amostraNomes, plural } = require('../utils/avisoAgregado');
const { periodosFechados } = require('./kpiPontualidade');





async function gerarTodasNotificacoes() {
  console.log('[Notificações] Gerando notificações automáticas...');
  let total = 0;


  const safe = async (nome, fn) => {
    try {
      const n = await fn();
      return typeof n === 'number' ? n : 0;
    } catch (e) {
      console.error(`[Notificações] ${nome} falhou:`, e.message);
      return 0;
    }
  };
  total += await safe('RH', gerarNotificacoesRH);
  total += await safe('SelecaoInterna', gerarNotificacoesSelecaoInterna);
  await safe('snapshotFolha', snapshotFolhaMensal);
  total += await safe('Financeiro', gerarNotificacoesFinanceiro);
  total += await safe('AnaliseFinanceira', rodarAnaliseFinanceiraDiaria);
  total += await safe('Logistica', gerarNotificacoesLogistica);
  total += await safe('Patrimonio', gerarNotificacoesPatrimonio);
  total += await safe('Membresia', gerarNotificacoesMembresia);
  total += await safe('Kpis', gerarNotificacoesKpis);
  total += await safe('Cuidados', gerarNotificacoesCuidados);
  total += await safe('JornadaConvertidos', gerarNotificacoesJornadaConvertidos);


  await safe('AgentePrimeiroContato', async () => {
    const { enfileirarPrimeiroContato } = require('./agentePrimeiroContato');
    return enfileirarPrimeiroContato();
  });
  total += await safe('Grupos', gerarNotificacoesGrupos);
  total += await safe('Ritual', gerarNotificacoesRitual);
  total += await safe('Solicitacoes', gerarNotificacoesSolicitacoes);
  total += await safe('Marketing', gerarNotificacoesMarketing);
  total += await safe('Online', gerarNotificacoesOnline);


  total += await safe('MonitorAutomacoes', async () => {
    const { checarEAlertar } = require('./monitorAutomacoes');
    return checarEAlertar();
  });


  total += await safe('AgenteVoluntariado', async () => {
    const { alertar } = require('./agenteVoluntariado');
    return alertar();
  });


  await safe('AgenteBatismoNext', async () => {
    const { enfileirar } = require('./agenteBatismoNext');
    return enfileirar();
  });
  total += await safe('Governanca', gerarNotificacoesGovernanca);
  total += await safe('TarefasPessoais', gerarNotificacoesTarefasPessoais);
  total += await safe('Kids', gerarNotificacoesKids);
  total += await safe('LgpdExclusao', gerarNotificacoesLgpdExclusao);
  console.log(`[Notificações] ${total} notificação(ões) gerada(s).`);
  return total;
}




async function gerarNotificacoesTarefasPessoais() {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  let count = 0;

  const { data: pendentes } = await supabase
    .from('tarefas_pessoais')
    .select('id, titulo, data, created_by')
    .eq('done', false)
    .not('data', 'is', null)
    .not('created_by', 'is', null)
    .lte('data', hoje)
    .limit(2000);

  for (const t of pendentes || []) {
    const venceHoje = t.data === hoje;
    count += await notificar({
      modulo: 'tarefas',
      tipo: venceHoje ? 'tarefa_vence_hoje' : 'tarefa_atrasada',
      titulo: venceHoje ? 'Tarefa vence hoje' : 'Tarefa atrasada',
      mensagem: venceHoje
        ? `"${t.titulo}" vence hoje.`
        : `"${t.titulo}" venceu em ${new Date(`${t.data}T12:00:00`).toLocaleDateString('pt-BR')}.`,
      link: '/tarefas',
      severidade: venceHoje ? 'aviso' : 'urgente',
      chaveDedup: venceHoje ? `tarefa_hoje_${t.id}_${t.data}` : `tarefa_atrasada_${t.id}`,
      targetIds: [t.created_by],
    });
  }
  return count;
}



async function gerarNotificacoesGovernanca() {
  let count = 0;
  const hoje = new Date().toISOString().slice(0, 10);
  const ha60d = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

  const { data: reunioes, error } = await supabase
    .from('governance_meetings')
    .select('id, date, status, ata, governance_meeting_types(nome, sigla)')
    .is('deleted_at', null)
    .lt('date', hoje)
    .gte('date', ha60d)
    .neq('status', 'cancelada')
    .neq('status', 'adiada');
  if (error) {
    if (!String(error.message || '').includes('does not exist')) {
      console.warn('[Governanca notify] erro:', error.message);
    }
    return 0;
  }


  const semAta = (reunioes || []).filter(r => !(r.ata && r.ata.trim().length));
  if (semAta.length) {
    const rotulos = semAta.map(r => {
      const tipo = r.governance_meeting_types || {};
      const nome = tipo.nome || 'Reunião';
      const dataBr = String(r.date).split('-').reverse().join('/');
      return `${nome}${tipo.sigla ? ` (${tipo.sigla})` : ''} de ${dataBr}`;
    });
    count += await notificar({
      modulo: 'governanca',
      tipo: 'ata_pendente',
      titulo: `${semAta.length} ${plural(semAta.length, 'reunião', 'reuniões')} sem ata registrada`,
      mensagem: `Ainda sem ata: ${amostraNomes(rotulos)}. Registre em Governança.`,
      link: '/governanca',
      severidade: 'info',
      chaveDedup: 'gov_ata_pendente',
    });
  }
  return count;
}




async function gerarNotificacoesRH() {
  let count = 0;
  const today = new Date().toISOString().slice(0, 10);
  const in7d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const in3d = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const in30d = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const in15d = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);


  const { data: feriasVencendo } = await supabase
    .from('rh_ferias_licencas')
    .select('id, funcionario_id, tipo, data_inicio, data_fim, rh_funcionarios!funcionario_id(nome)')
    .eq('status', 'aprovado')
    .gte('data_fim', today)
    .lte('data_fim', in7d);

  for (const f of feriasVencendo || []) {
    const nome = f.rh_funcionarios?.nome || 'Funcionário';
    const fmtDate = new Date(f.data_fim + 'T12:00:00').toLocaleDateString('pt-BR');
    count += await notificar({
      modulo: 'rh',
      tipo: 'ferias_vencendo',
      titulo: `Férias terminando — ${nome}`,
      mensagem: `As férias de ${nome} terminam em ${fmtDate}.`,
      link: '/admin/rh',
      severidade: 'aviso',
      chaveDedup: `ferias_vencendo_${f.id}`,
    });
  }


  const { data: feriasInicio } = await supabase
    .from('rh_ferias_licencas')
    .select('id, funcionario_id, tipo, data_inicio, rh_funcionarios!funcionario_id(nome)')
    .eq('status', 'aprovado')
    .gte('data_inicio', today)
    .lte('data_inicio', in3d);

  for (const f of feriasInicio || []) {
    const nome = f.rh_funcionarios?.nome || 'Funcionário';
    const fmtDate = new Date(f.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR');
    count += await notificar({
      modulo: 'rh',
      tipo: 'ferias_inicio',
      titulo: `Férias iniciando — ${nome}`,
      mensagem: `${nome} entra de férias em ${fmtDate}.`,
      link: '/admin/rh',
      severidade: 'info',
      chaveDedup: `ferias_inicio_${f.id}`,
    });
  }


  const { data: feriasPendentes } = await supabase
    .from('rh_ferias_licencas')
    .select('id, funcionario_id, created_at, rh_funcionarios!funcionario_id(nome)')
    .eq('status', 'pendente');

  for (const f of feriasPendentes || []) {
    const dias = Math.floor((Date.now() - new Date(f.created_at).getTime()) / 86400000);
    if (dias < 3) continue;
    const nome = f.rh_funcionarios?.nome || 'Funcionário';
    count += await notificar({
      modulo: 'rh',
      tipo: 'ferias_pendente',
      titulo: `Férias pendente — ${nome}`,
      mensagem: `Solicitação de férias de ${nome} aguarda aprovação há ${dias} dias.`,
      link: '/admin/rh',
      severidade: 'aviso',
      chaveDedup: `ferias_pendente_${f.id}`,
    });
  }


  const { data: docsVencendo } = await supabase
    .from('rh_documentos')
    .select('id, nome, tipo, data_expiracao, funcionario_id, rh_funcionarios(nome)')
    .gte('data_expiracao', today)
    .lte('data_expiracao', in30d);

  for (const d of docsVencendo || []) {
    const nome = d.rh_funcionarios?.nome || 'Funcionário';
    const fmtDate = new Date(d.data_expiracao + 'T12:00:00').toLocaleDateString('pt-BR');
    count += await notificar({
      modulo: 'rh',
      tipo: 'doc_vencendo',
      titulo: `Documento vencendo — ${nome}`,
      mensagem: `${d.nome} de ${nome} vence em ${fmtDate}.`,
      link: '/admin/rh',
      severidade: 'aviso',
      chaveDedup: `doc_vencendo_${d.id}`,
    });
  }


  const { data: docsVencidos } = await supabase
    .from('rh_documentos')
    .select('id, nome, tipo, data_expiracao, funcionario_id, rh_funcionarios(nome)')
    .lt('data_expiracao', today)
    .not('data_expiracao', 'is', null);

  for (const d of docsVencidos || []) {
    const nome = d.rh_funcionarios?.nome || 'Funcionário';
    count += await notificar({
      modulo: 'rh',
      tipo: 'doc_vencido',
      titulo: `Documento VENCIDO — ${nome}`,
      mensagem: `${d.nome} de ${nome} está vencido!`,
      link: '/admin/rh',
      severidade: 'urgente',
      chaveDedup: `doc_vencido_${d.id}`,
    });
  }


  const { data: funcionarios } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, data_admissao, tipo_contrato')
    .eq('status', 'ativo')
    .ilike('tipo_contrato', 'clt');

  for (const func of funcionarios || []) {
    const admissao = new Date(func.data_admissao + 'T12:00:00');
    const fim90 = new Date(admissao.getTime() + 90 * 86400000);
    const todayDate = new Date(today + 'T12:00:00');
    const diff = Math.floor((fim90.getTime() - todayDate.getTime()) / 86400000);
    if (diff >= 0 && diff <= 15) {
      const fmtDate = fim90.toLocaleDateString('pt-BR');
      count += await notificar({
        modulo: 'rh',
        tipo: 'experiencia_vencendo',
        titulo: `Experiência vencendo — ${func.nome}`,
        mensagem: `Período de experiência de ${func.nome} termina em ${fmtDate} (${diff} dias).`,
        link: '/admin/rh',
        severidade: 'aviso',
        chaveDedup: `exp_vencendo_${func.id}`,
      });
    }
  }




  const { data: emAfastamento } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, status')
    .in('status', ['ferias', 'licenca']);
  if (emAfastamento && emAfastamento.length) {
    const { data: ativasHoje } = await supabase
      .from('rh_ferias_licencas')
      .select('funcionario_id')
      .eq('status', 'aprovado')
      .lte('data_inicio', today)
      .gte('data_fim', today);
    const comPeriodoAtivo = new Set((ativasHoje || []).map(f => f.funcionario_id));
    const voltaram = emAfastamento.filter(f => !comPeriodoAtivo.has(f.id));
    if (voltaram.length) {
      await supabase.from('rh_funcionarios').update({ status: 'ativo' }).in('id', voltaram.map(f => f.id));


      for (const f of voltaram) {
        const oQue = f.status === 'licenca' ? 'licença' : 'férias';
        count += await notificar({
          modulo: 'rh',
          tipo: 'afastamento_encerrado',
          titulo: `Retorno de ${oQue} — ${f.nome}`,
          mensagem: `O período de ${oQue} de ${f.nome} terminou. O status foi atualizado automaticamente para Ativo.`,
          link: '/admin/rh',
          severidade: 'info',
          chaveDedup: `afastamento_encerrado_${f.id}_${today}`,
        });
      }
    }
  }

  return count;
}




async function snapshotFolhaMensal() {
  try {
    const mes = new Date().toISOString().slice(0, 8) + '01';
    const { data: ativos } = await supabase
      .from('rh_funcionarios')
      .select('salario, custo_total_mensal')
      .eq('status', 'ativo')
      .is('deleted_at', null);
    const totalSalarios = (ativos || []).reduce((s, f) => s + Number(f.salario || 0), 0);
    const totalCusto = (ativos || []).reduce((s, f) => s + Number(f.custo_total_mensal || f.salario || 0), 0);
    await supabase.from('rh_folha_snapshots').upsert(
      { mes, total_salarios: totalSalarios, total_custo: totalCusto, headcount: (ativos || []).length, atualizado_em: new Date().toISOString() },
      { onConflict: 'mes' }
    );
  } catch (e) {
    console.error('[RH] snapshot folha:', e.message);
  }
}




async function gerarNotificacoesFinanceiro() {
  let count = 0;
  const today = new Date().toISOString().slice(0, 10);
  const in7d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDia = (d) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');



  const { data: contasVencendo } = await supabase
    .from('fin_contas_pagar')
    .select('id, descricao, valor, data_vencimento')
    .eq('status', 'pendente')
    .gte('data_vencimento', today)
    .lte('data_vencimento', in7d)
    .order('data_vencimento', { ascending: true });

  if ((contasVencendo || []).length) {
    const totalV = contasVencendo.reduce((s, c) => s + Number(c.valor || 0), 0);
    const prox = contasVencendo[0];
    count += await notificar({
      modulo: 'financeiro',
      tipo: 'conta_vencendo',
      titulo: contasVencendo.length === 1
        ? 'Conta a pagar vencendo'
        : `${contasVencendo.length} contas a pagar vencem em 7 dias`,
      mensagem: contasVencendo.length === 1
        ? `${prox.descricao} — ${fmtBRL(prox.valor)} vence em ${fmtDia(prox.data_vencimento)}.`
        : `${contasVencendo.length} contas vencem nos próximos 7 dias · total ${fmtBRL(totalV)}. Próxima: ${prox.descricao} em ${fmtDia(prox.data_vencimento)}.`,
      link: '/admin/financeiro',
      severidade: 'aviso',
      chaveDedup: `contas_vencendo_${today}`,
    });
  }


  const { data: contasVencidas } = await supabase
    .from('fin_contas_pagar')
    .select('id, descricao, valor, data_vencimento')
    .eq('status', 'pendente')
    .lt('data_vencimento', today)
    .order('data_vencimento', { ascending: true });

  if ((contasVencidas || []).length) {
    const totalVenc = contasVencidas.reduce((s, c) => s + Number(c.valor || 0), 0);
    const antiga = contasVencidas[0];
    count += await notificar({
      modulo: 'financeiro',
      tipo: 'conta_vencida',
      titulo: contasVencidas.length === 1
        ? 'Conta a pagar VENCIDA'
        : `${contasVencidas.length} contas a pagar VENCIDAS`,
      mensagem: contasVencidas.length === 1
        ? `${antiga.descricao} — ${fmtBRL(antiga.valor)} está vencida (desde ${fmtDia(antiga.data_vencimento)}).`
        : `${contasVencidas.length} contas vencidas · total ${fmtBRL(totalVenc)}. A mais antiga: ${antiga.descricao} desde ${fmtDia(antiga.data_vencimento)}.`,
      link: '/admin/financeiro',
      severidade: 'urgente',
      chaveDedup: `contas_vencidas_${today}`,
    });
  }


  const { data: reembolsos } = await supabase
    .from('fin_reembolsos')
    .select('id, descricao, valor, created_at, solicitante_id, profiles!solicitante_id(name)')
    .eq('status', 'pendente');

  for (const r of reembolsos || []) {
    const dias = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
    if (dias < 5) continue;
    const fmtVal = Number(r.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    count += await notificar({
      modulo: 'financeiro',
      tipo: 'reembolso_pendente',
      titulo: `Reembolso pendente`,
      mensagem: `${r.descricao} — ${fmtVal} de ${r.profiles?.name || 'usuário'} aguarda há ${dias} dias.`,
      link: '/admin/financeiro',
      severidade: 'aviso',
      chaveDedup: `reembolso_pendente_${r.id}`,
    });
  }



  try {
    const { count: filaCount } = await supabase
      .from('fin_fila_classificacao')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pendente');

    const hoje = new Date().toISOString().slice(0, 10);
    if (filaCount && filaCount >= 20) {
      count += await notificar({
        modulo: 'financeiro',
        tipo: 'fila_classificacao_alta',
        titulo: `Fila de classificação com ${filaCount} itens`,
        mensagem: `Ha ${filaCount} lancamentos aguardando classificação. Revise em /admin/financeiro -> Fila de classificação.`,
        link: '/admin/financeiro',
        severidade: filaCount >= 50 ? 'urgente' : 'aviso',
        chaveDedup: `fila_classificacao_alta_${hoje}`,
      });
    }


    const seteDiasAtras = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: brutosVelhos } = await supabase
      .from('fin_lancamentos_brutos')
      .select('id', { count: 'exact', head: true })
      .eq('ja_classificado', false)
      .lt('created_at', seteDiasAtras);

    if (brutosVelhos && brutosVelhos > 0) {
      count += await notificar({
        modulo: 'financeiro',
        tipo: 'lancamentos_pendentes_antigos',
        titulo: `${brutosVelhos} lancamentos sem classificar ha >7 dias`,
        mensagem: `Ha ${brutosVelhos} transacoes importadas ha mais de 7 dias ainda sem classificação. Verifique a fila.`,
        link: '/admin/financeiro',
        severidade: 'aviso',
        chaveDedup: `lanc_pendentes_antigos_${hoje}`,
      });
    }


    const { data: ultimoUpload } = await supabase
      .from('fin_uploads')
      .select('created_at, tipo')
      .eq('status', 'concluido')
      .order('created_at', { ascending: false })
      .limit(1);

    if (ultimoUpload && ultimoUpload[0]) {
      const diasSemUpload = Math.floor((Date.now() - new Date(ultimoUpload[0].created_at).getTime()) / 86400000);
      if (diasSemUpload >= 10) {
        count += await notificar({
          modulo: 'financeiro',
          tipo: 'sem_upload_recente',
          titulo: `Sem importar extrato ha ${diasSemUpload} dias`,
          mensagem: `Último upload foi ha ${diasSemUpload} dias. Considere importar o extrato mais recente.`,
          link: '/admin/financeiro',
          severidade: 'aviso',
          chaveDedup: `sem_upload_${hoje}`,
        });
      }
    }
  } catch (e) {

    if (!String(e.message || '').includes('does not exist')) {
      console.warn('[NOTIF-FIN] Erro nas regras PR B:', e.message);
    }
  }


  try {
    const limite = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: notasParadas } = await supabase
      .from('log_notas_fiscais')
      .select('id', { count: 'exact' })
      .eq('status', 'enviada_financeiro')
      .lt('enviada_financeiro_em', limite);

    if (notasParadas?.length) {
      const n = notasParadas.length;
      count += await notificar({
        modulo: 'financeiro',
        tipo: 'nf_compra_parada',
        titulo: 'Notas fiscais de compras aguardando lançamento',
        mensagem: `${n} nota${n > 1 ? 's' : ''} fiscal${n > 1 ? 'is' : ''} de compras aguarda${n > 1 ? 'm' : ''} lançamento há mais de 3 dias.`,
        link: '/admin/financeiro',
        severidade: 'aviso',
        chaveDedup: `nf_paradas_${today}`,
      });
    }
  } catch (e) {
    if (!String(e.message || '').includes('does not exist')) {
      console.warn('[NOTIF-FIN] Erro nas notas de compras:', e.message);
    }
  }

  return count;
}




async function gerarNotificacoesLogistica() {
  let count = 0;
  const today = new Date().toISOString().slice(0, 10);


  const { data: pedidos } = await supabase
    .from('log_pedidos')
    .select('id, descricao, data_prevista, status')
    .in('status', ['aguardando', 'em_transito'])
    .lt('data_prevista', today)
    .not('data_prevista', 'is', null);

  for (const p of pedidos || []) {
    count += await notificar({
      modulo: 'logistica',
      tipo: 'pedido_atrasado',
      titulo: `Pedido atrasado`,
      mensagem: `${p.descricao?.slice(0, 60) || 'Pedido'} está atrasado (previsão: ${new Date(p.data_prevista + 'T12:00:00').toLocaleDateString('pt-BR')}).`,
      link: '/admin/logistica',
      severidade: 'aviso',
      chaveDedup: `ped_atrasado_${p.id}`,
    });
  }








  return count;
}




async function gerarNotificacoesPatrimonio() {
  let count = 0;





  const { data: extraviados } = await supabase
    .from('pat_bens')
    .select('id, nome, codigo_barras')
    .eq('status', 'extraviado');

  for (const b of extraviados || []) {
    count += await notificar({
      modulo: 'patrimonio',
      tipo: 'bem_extraviado',
      titulo: `Bem extraviado`,
      mensagem: `${b.nome} (${b.codigo_barras || 'sem código'}) está marcado como extraviado.`,
      link: '/admin/patrimonio',
      severidade: 'urgente',
      chaveDedup: `extraviado_${b.id}`,
    });
  }





  const anoMes = new Date().toISOString().slice(0, 7);
  const { data: bensAtivos } = await supabase
    .from('pat_bens')
    .select('id, nome, codigo_barras, valor_aquisicao, data_aquisicao, pat_categorias(nome, vida_util_meses)')
    .eq('status', 'ativo')
    .not('valor_aquisicao', 'is', null)
    .not('data_aquisicao', 'is', null);

  for (const b of bensAtivos || []) {
    const dep = calcularDepreciacao(b);
    if (!dep || dep.percentual_depreciado < 80) continue;
    count += await notificar({
      modulo: 'patrimonio',
      tipo: 'bem_fim_vida_util',
      titulo: `Bem perto do fim da vida útil: ${b.nome}`,
      mensagem: `${b.nome} (${b.codigo_barras || 'sem código'}) está ${dep.percentual_depreciado}% depreciado (indicador gerencial) — considere planejar a reposição.`,
      link: '/admin/patrimonio',
      severidade: dep.percentual_depreciado >= 100 ? 'warning' : 'info',
      chaveDedup: `dep_fim_vida_${b.id}_${anoMes}`,
    });
  }

  return count;
}




async function gerarNotificacoesMembresia() {
  let count = 0;


  const { data: pendentes } = await supabase
    .from('mem_cadastros_pendentes')
    .select('id, nome, created_at')
    .eq('status', 'pendente');

  for (const c of pendentes || []) {
    const dias = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
    const severidade = dias >= 3 ? 'urgente' : dias >= 1 ? 'aviso' : 'info';
    if (dias < 1) continue;
    count += await notificar({
      modulo: 'membresia',
      tipo: 'cadastro_pendente',
      titulo: `Cadastro pendente — ${c.nome}`,
      mensagem: dias === 1
        ? `${c.nome} enviou cadastro de membresia ontem e aguarda aprovação.`
        : `${c.nome} aguarda aprovação de membresia há ${dias} dias.`,
      link: '/ministerial/membresia?tab=cadastros&status=pendente',
      severidade,
      chaveDedup: `cadastro_pendente_${c.id}`,
    });
  }




  try {
    const { count: abertas, error } = await supabase
      .from('identidade_pendencias')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pendente');
    if (!error && (abertas || 0) > 0) {
      const hoje = new Date().toISOString().slice(0, 10);
      count += await notificar({
        modulo: 'membresia',
        tipo: 'identidade_pendencias',
        titulo: `Fila de identidade — ${abertas} pendência${abertas > 1 ? 's' : ''} de CPF`,
        mensagem: `Há ${abertas} conflito${abertas > 1 ? 's' : ''} de identidade aguardando triagem (CPF a confirmar, duplicatas prováveis, vínculos divergentes) em Entradas > Identidade.`,
        link: '/next-batismo',
        severidade: abertas >= 50 ? 'aviso' : 'info',
        chaveDedup: `identidade_pendencias_${hoje}`,
      });
    }
  } catch {                                   }

















  try {
    const { ehNomeDerivadoDeEmail, nomeEhEnderecoDeEmail } = require('./membroMatch');
    const suspeitos = [];
    const comEmailNoNome = [];
    const PAGE = 1000;
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('mem_membros')
        .select('id, nome, email, created_at')
        .eq('active', true)
        .is('deleted_at', null)
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      for (const m of data || []) {
        if (ehNomeDerivadoDeEmail(m.nome, m.email)) suspeitos.push(m);


        else if (nomeEhEnderecoDeEmail(m.nome)) comEmailNoNome.push(m);
      }
      if (!data || data.length < PAGE) break;
      offset += PAGE;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    if (comEmailNoNome.length) {
      count += await notificar({
        modulo: 'membresia',
        tipo: 'cadastro_email_no_nome',
        titulo: `${comEmailNoNome.length} cadastro(s) com e-mail no campo do nome`,
        mensagem: `${comEmailNoNome.length} pessoa(s) têm um endereço de e-mail onde deveria estar o nome (ex.: ${JSON.stringify(comEmailNoNome[0].nome)}). O nome real não é derivável do endereço — precisa de contato. NÃO apagar: são pessoas reais e apagar quebra o matcher.`,
        link: '/ministerial/membresia',
        severidade: 'info',
        chaveDedup: `cadastro_email_no_nome_${hoje}`,
      });
    }
    if (suspeitos.length) {
      const novos7d = suspeitos.filter(
        (m) => new Date(m.created_at).getTime() > Date.now() - 7 * 86400000,
      ).length;
      count += await notificar({
        modulo: 'membresia',
        tipo: 'cadastro_sem_nome_real',
        titulo: `${suspeitos.length} cadastro(s) com o e-mail no lugar do nome`,
        mensagem: `${suspeitos.length} pessoa(s) estão cadastradas com o prefixo do e-mail como nome (ex.: ${JSON.stringify(suspeitos[0].nome)})${novos7d ? ` — ${novos7d} nos últimos 7 dias` : ''}. Vem do login quando o provedor não informa o nome. Corrigir o nome na Membresia; NÃO apagar (são pessoas reais e apagar quebra o matcher).`,
        link: '/ministerial/membresia',
        severidade: novos7d ? 'aviso' : 'info',
        chaveDedup: `cadastro_sem_nome_real_${hoje}`,
      });
    }
  } catch (e) {
    console.error('[Notificações] cadastro sem nome real:', e.message);
  }

  return count;
}




async function gerarNotificacoesKpis() {
  let count = 0;
  const today = new Date().toISOString().slice(0, 10);

  const limite48h = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const limite30d = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data: semVideo } = await supabase
    .from('cultos')
    .select('id, nome, data')
    .is('youtube_video_id', null)
    .lte('data', limite48h)
    .gte('data', limite30d);

  for (const c of semVideo || []) {
    const fmtDate = new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR');
    count += await notificar({
      modulo: 'kpis',
      tipo: 'culto_sem_video',
      titulo: `Culto sem vídeo do YouTube`,
      mensagem: `"${c.nome}" (${fmtDate}) está sem ID de vídeo do YouTube há mais de 48h. Sincronização não vai coletar views.`,
      link: '/kpis',
      severidade: 'aviso',
      chaveDedup: `culto_sem_video_${c.id}`,
    });
  }

  return count;
}




async function gerarNotificacoesCuidados() {
  let count = 0;


  const { data: acomps } = await supabase
    .from('cui_acompanhamentos')
    .select('id, nome, responsavel_id, membro_id, created_at, status');

  const ativos = (acomps || []).filter(a => a.status !== 'encerrado');


  const membroIds = [...new Set(ativos.map(a => a.membro_id).filter(Boolean))];
  const acompIds = ativos.map(a => a.id);
  const ultimoHistPorMembro = {};
  const ultimoAtendPorAcomp = {};

  if (membroIds.length) {
    const { data: hists } = await supabase
      .from('mem_historico')
      .select('membro_id, data, created_at')
      .in('membro_id', membroIds)
      .order('data', { ascending: false });
    for (const h of hists || []) {
      if (!ultimoHistPorMembro[h.membro_id]) {
        ultimoHistPorMembro[h.membro_id] = h.data || h.created_at;
      }
    }
  }

  if (acompIds.length) {
    const { data: atends } = await supabase
      .from('cui_atendimentos')
      .select('acompanhamento_id, data, created_at')
      .in('acompanhamento_id', acompIds)
      .order('data', { ascending: false });
    for (const a of atends || []) {
      if (!ultimoAtendPorAcomp[a.acompanhamento_id]) {
        ultimoAtendPorAcomp[a.acompanhamento_id] = a.data || a.created_at;
      }
    }
  }

  for (const a of ativos) {
    const candidatos = [new Date(a.created_at).getTime()];
    const ultimoHist = a.membro_id ? ultimoHistPorMembro[a.membro_id] : null;
    if (ultimoHist) {
      const t = new Date(ultimoHist + (ultimoHist.length === 10 ? 'T12:00:00' : '')).getTime();
      if (!isNaN(t)) candidatos.push(t);
    }
    const ultimoAtend = ultimoAtendPorAcomp[a.id];
    if (ultimoAtend) {
      const t = new Date(ultimoAtend + (ultimoAtend.length === 10 ? 'T12:00:00' : '')).getTime();
      if (!isNaN(t)) candidatos.push(t);
    }
    const ultima = Math.max(...candidatos);
    const dias = Math.floor((Date.now() - ultima) / 86400000);
    if (dias < 30) continue;

    const targetIds = a.responsavel_id ? [a.responsavel_id] : null;
    count += await notificar({
      modulo: 'cuidados',
      tipo: 'acomp_inativo',
      titulo: `Acompanhamento sem atualização — ${a.nome}`,
      mensagem: `${a.nome} está em acompanhamento há ${dias} dias sem novo registro. Considere atualizar ou encerrar.`,
      link: '/ministerial/cuidados',
      severidade: dias >= 60 ? 'urgente' : 'aviso',
      chaveDedup: `acomp_inativo_${a.id}_${Math.floor(dias / 30)}`,
      targetIds,
    });
  }

  return count;
}





async function gerarNotificacoesJornadaConvertidos() {
  let count = 0;
  const DIA = 86400000;
  const hojeStr = new Date().toISOString().slice(0, 10);
  const desde = new Date(Date.now() - 30 * DIA).toISOString().slice(0, 10);

  const { data: convs } = await supabase
    .from('cui_convertidos')
    .select('id, nome, data_culto, area')
    .is('deleted_at', null)
    .is('primeiro_contato_em', null)
    .gte('data_culto', desde);

  const ehArea = (a) => ['ami', 'bridge', 'online'].includes(a);
  const moduloArea = (a) => ehArea(a) ? a : 'cuidados';
  const linkArea = (a) => ehArea(a) ? `/${a}` : '/ministerial/cuidados?tab=primeiros-passos';

  for (const c of convs || []) {
    const dias = Math.floor((Date.now() - new Date(c.data_culto + 'T12:00:00').getTime()) / DIA);
    if (dias < 2) continue;
    const area = c.area || 'sede';


    count += await notificar({
      modulo: moduloArea(area),
      tipo: 'convertido_sem_contato',
      titulo: `Sem contato pastoral: ${c.nome}`,
      mensagem: `${c.nome} se converteu há ${dias} dias e ainda não recebeu contato. Faça o contato e marque o encontro (meta: 3 dias).`,
      link: linkArea(area),
      severidade: dias > 3 ? 'warning' : 'info',
      chaveDedup: `jornada_contato_${c.id}_${hojeStr}`,
    });


    if (dias > 3 && moduloArea(area) !== 'cuidados') {
      count += await notificar({
        modulo: 'cuidados',
        tipo: 'convertido_sem_contato_atrasado',
        titulo: `Atrasado (${area}): ${c.nome}`,
        mensagem: `${c.nome} (${area}) está há ${dias} dias sem contato pastoral — passou do prazo de 3 dias. Cobrar o líder da área.`,
        link: '/ministerial/cuidados?tab=primeiros-passos',
        severidade: 'warning',
        chaveDedup: `jornada_contato_esc_${c.id}_${hojeStr}`,
      });
    }
  }
  return count;
}




async function gerarNotificacoesGrupos() {
  let count = 0;
  const now = Date.now();


  const limites = { semanal: 14, quinzenal: 21, mensal: 45 };
  const { data: grupos } = await supabase
    .from('mem_grupos')
    .select('id, nome, recorrencia, lider_id, mem_membros!lider_id(nome)')
    .eq('ativo', true);

  if (grupos?.length) {
    const grupoIds = grupos.map(g => g.id);
    const donosPorGrupo = await donosDeVariosGrupos(grupoIds);
    const { data: encontros } = await supabase
      .from('mem_grupo_encontros')
      .select('grupo_id, data')
      .in('grupo_id', grupoIds)
      .order('data', { ascending: false });


    const ultimoPorGrupo = {};
    for (const e of encontros || []) {
      if (!ultimoPorGrupo[e.grupo_id]) ultimoPorGrupo[e.grupo_id] = e.data;
    }


    const atrasados = [];
    for (const g of grupos) {
      const recorrencia = g.recorrencia || 'semanal';
      const limiteDias = limites[recorrencia] || 14;
      const ultimo = ultimoPorGrupo[g.id];

      const dias = ultimo
        ? Math.floor((now - new Date(ultimo + 'T12:00:00').getTime()) / 86400000)
        : 999;
      if (dias < limiteDias) continue;







      const donos = donosPorGrupo.get(g.id) || [];
      if (donos.length) {
        const lider = g.mem_membros?.nome ? ` (líder: ${g.mem_membros.nome})` : '';
        const janela = Math.floor(dias / limiteDias);
        count += await notificar({
          modulo: 'grupos',
          tipo: 'grupo_sem_encontro',
          titulo: `Grupo sem encontro — ${g.nome}`,
          mensagem: ultimo
            ? `${g.nome}${lider} está sem encontro registrado há ${dias} dias.`
            : `${g.nome}${lider} ainda não teve encontro registrado.`,
          link: '/grupos',
          severidade: dias >= limiteDias * 2 ? 'urgente' : 'aviso',
          chaveDedup: `grupo_sem_encontro_${g.id}_${janela}`,
          targetIds: donos,
        });
        continue;
      }



      atrasados.push({
        nome: g.nome,
        dias,
        nunca: !ultimo,
        urgente: dias >= limiteDias * 2,
      });
    }

    if (atrasados.length) {
      atrasados.sort((a, b) => b.dias - a.dias);
      const rotulos = atrasados.map(a => (
        a.nunca ? `${a.nome} (nunca registrou)` : `${a.nome} (${a.dias} dias)`
      ));
      const urgentes = atrasados.filter(a => a.urgente).length;
      count += await notificar({
        modulo: 'grupos',
        tipo: 'grupo_sem_encontro',
        titulo: `${atrasados.length} ${plural(atrasados.length, 'grupo', 'grupos')} sem encontro registrado`,
        mensagem: `Passaram do prazo de registro: ${amostraNomes(rotulos)}.`
          + (urgentes ? ` ${urgentes} ${plural(urgentes, 'passou', 'passaram')} do dobro do prazo.` : '')
          + ' A lista completa está em Grupos.',
        link: '/grupos',
        severidade: urgentes ? 'urgente' : 'aviso',
        chaveDedup: 'grupo_sem_encontro',
      });
    }
  }






  const noventaDias = new Date(now - 90 * 86400000).toISOString().slice(0, 10);
  const PAGE = 1000;
  const membros = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data: pagina } = await supabase
      .from('mem_membros')
      .select('id, nome, created_at, status, active')
      .eq('active', true)
      .eq('status', 'membro_ativo')
      .is('deleted_at', null)
      .lte('created_at', noventaDias)
      .order('id')
      .range(offset, offset + PAGE - 1);
    membros.push(...(pagina || []));
    if (!pagina || pagina.length < PAGE) break;
  }

  if (membros.length) {
    const comGrupo = new Set();
    for (let offset = 0; ; offset += PAGE) {
      const { data: pagina } = await supabase
        .from('mem_grupo_membros')
        .select('membro_id')
        .is('saiu_em', null)
        .is('deleted_at', null)
        .order('id')
        .range(offset, offset + PAGE - 1);
      (pagina || []).forEach(p => { if (p.membro_id) comGrupo.add(p.membro_id); });
      if (!pagina || pagina.length < PAGE) break;
    }
    const semGrupo = membros.filter(m => !comGrupo.has(m.id));


    if (semGrupo.length) {
      const comDias = semGrupo
        .map(m => ({
          nome: m.nome,
          dias: Math.floor((now - new Date(m.created_at).getTime()) / 86400000),
        }))
        .sort((a, b) => b.dias - a.dias);
      const antigos = comDias.filter(m => m.dias >= 180).length;
      count += await notificar({
        modulo: 'grupos',
        tipo: 'membro_sem_grupo',
        titulo: `${comDias.length} ${plural(comDias.length, 'membro', 'membros')} sem grupo de conexão`,
        mensagem: `Membros ativos há 90+ dias e ainda fora de um grupo: `
          + `${amostraNomes(comDias.map(m => `${m.nome} (${m.dias} dias)`))}.`
          + (antigos ? ` ${antigos} ${plural(antigos, 'já passou', 'já passaram')} de 180 dias.` : ''),
        link: '/grupos',
        severidade: antigos ? 'aviso' : 'info',
        chaveDedup: 'membro_sem_grupo',
      });
    }
  }

















  const { data: pendentes } = await supabase
    .from('mem_grupo_pedidos')
    .select('id, grupo_id, created_at')
    .eq('status', 'pendente')
    .is('deleted_at', null)
    .not('grupo_id', 'is', null);

  if (pendentes?.length) {
    const donosPend = await donosDeVariosGrupos([...new Set(pendentes.map(p => p.grupo_id))]);



    const orfaos = pendentes.filter(p => !(donosPend.get(p.grupo_id) || []).length);
    if (orfaos.length) {
      const diasDoMaisAntigo = Math.max(...orfaos.map(p => (
        Math.floor((now - new Date(p.created_at).getTime()) / 86400000)
      )));
      const gruposDistintos = new Set(orfaos.map(p => p.grupo_id)).size;
      count += await notificar({
        modulo: 'grupos',
        tipo: 'pedidos_aguardando_lider',
        titulo: `${orfaos.length} ${plural(orfaos.length, 'pedido', 'pedidos')} de grupo aguardando o líder`,
        mensagem: `${orfaos.length} ${plural(orfaos.length, 'pedido pendente', 'pedidos pendentes')} em `
          + `${gruposDistintos} ${plural(gruposDistintos, 'grupo', 'grupos')} cujo líder não tem conta no `
          + `sistema (ele é avisado pelo WhatsApp). O mais antigo espera há `
          + `${diasDoMaisAntigo} ${plural(diasDoMaisAntigo, 'dia', 'dias')}.`,
        link: '/grupos?tab=entrada',
        severidade: diasDoMaisAntigo >= 7 ? 'aviso' : 'info',
        chaveDedup: 'pedidos_aguardando_lider',
      });
    }
  }



  const { data: supGrupos } = await supabase
    .from('vw_grupos_supervisao')
    .select('id, nome, ultima_visita');

  if (supGrupos?.length) {
    const semVisita = supGrupos.filter(g => {
      if (!g.ultima_visita) return true;
      const dias = Math.floor((now - new Date(g.ultima_visita + 'T12:00:00').getTime()) / 86400000);
      return dias > 60;
    });
    if (semVisita.length) {
      const nomes = semVisita.slice(0, 5).map(g => g.nome).join(', ');
      const resto = semVisita.length > 5 ? ` e mais ${semVisita.length - 5}` : '';
      const semana = Math.floor(now / (7 * 86400000));
      count += await notificar({
        modulo: 'grupos',
        tipo: 'grupos_sem_visita',
        titulo: `${semVisita.length} grupo${semVisita.length !== 1 ? 's' : ''} sem visita há mais de 2 meses`,
        mensagem: `Sem visita de supervisão há mais de 60 dias: ${nomes}${resto}. Agende as visitas na aba Visitas de Grupos.`,
        link: '/grupos?tab=visitas',
        severidade: 'aviso',
        chaveDedup: `grupos_sem_visita_w${semana}`,
      });
    }
  }

  return count;
}




async function gerarNotificacoesRitual() {
  let count = 0;
  const hoje = new Date();
  const dia = hoje.getDate();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const periodo = `${ano}-${String(mes).padStart(2, '0')}`;


  const { data: diretoria } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('is_diretoria_geral', true)
    .eq('active', true);
  const targetIds = (diretoria || []).map(d => d.id);


  const { data: trajs } = await supabase
    .from('vw_kpi_trajetoria_atual')
    .select('kpi_id, status_trajetoria');
  const emAlerta = (trajs || []).filter(t =>
    t.status_trajetoria === 'critico' || t.status_trajetoria === 'atras'
  );
  const totalAlerta = emAlerta.length;

  if (totalAlerta === 0) return 0;


  const ids = emAlerta.map(t => t.kpi_id);
  const { data: revs } = await supabase
    .from('okr_revisoes')
    .select('kpi_id')
    .in('kpi_id', ids)
    .eq('periodo_referencia', periodo);
  const revisados = new Set((revs || []).map(r => r.kpi_id));
  const totalPendentes = totalAlerta - revisados.size;


  if (dia === 5 && totalPendentes > 0 && targetIds.length > 0) {
    count += await notificar({
      modulo: 'kpis',
      tipo: 'ritual_aberto',
      titulo: `Ritual Mensal — ${totalPendentes} OKR(s) aguardando revisao`,
      mensagem: `${totalAlerta} KPIs em alerta este mês (${revisados.size} já revisados, ${totalPendentes} pendentes). Acesse o Ritual Mensal para registrar causa, decisão, responsável e próximo passo.`,
      link: '/ritual',
      severidade: 'aviso',
      chaveDedup: `ritual_aberto_${periodo}`,
      targetIds,
    });
  }


  if (dia === 15 && totalPendentes > 0 && targetIds.length > 0) {
    count += await notificar({
      modulo: 'kpis',
      tipo: 'ritual_meio_mes',
      titulo: `Ritual ainda não concluído — ${totalPendentes} pendentes`,
      mensagem: `Metade do mês já passou. Faltam ${totalPendentes} OKRs em alerta sem revisão registrada.`,
      link: '/ritual',
      severidade: 'aviso',
      chaveDedup: `ritual_meio_${periodo}`,
      targetIds,
    });
  }


  if (dia === 25 && totalPendentes > 0 && targetIds.length > 0) {
    count += await notificar({
      modulo: 'kpis',
      tipo: 'ritual_fim_mes',
      titulo: `Ritual fecha em 5 dias — ${totalPendentes} ainda pendentes`,
      mensagem: `O mês esta acabando e ainda ha ${totalPendentes} OKRs em alerta sem revisão. Até o fim do mês.`,
      link: '/ritual',
      severidade: 'critico',
      chaveDedup: `ritual_fim_${periodo}`,
      targetIds,
    });
  }





  if (hoje.getDay() === 3) {
    const { data: kpisSemanais } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, area, lider_funcionario_id')
      .eq('ativo', true)
      .eq('periodicidade', 'semanal');

    if (kpisSemanais?.length) {









      const semanaCobrada = periodosFechados('semanal', 1, hoje)[0];

      const [regsRes, calcRes] = await Promise.all([
        supabase.from('kpi_registros')
          .select('indicador_id, valor_realizado')
          .eq('periodo_referencia', semanaCobrada),
        supabase.from('kpi_valores_calculados')
          .select('kpi_id, valor_calculado')
          .eq('periodo_referencia', semanaCobrada),
      ]);



      if (regsRes.error || calcRes.error) {
        console.warn('[notif] kpis semanais: leitura incompleta, pulando a cobrança desta rodada');
        return count;
      }



      const preenchidos = new Set();
      (regsRes.data || []).forEach(r => { if (r.valor_realizado != null) preenchidos.add(r.indicador_id); });
      (calcRes.data || []).forEach(c => { if (c.valor_calculado != null) preenchidos.add(c.kpi_id); });

      const pendentes = kpisSemanais.filter(k => !preenchidos.has(k.id));
      if (pendentes.length > 0) {








        const semDono = [];
        const porDono = new Map();
        pendentes.forEach(k => {
          if (k.lider_funcionario_id) {
            if (!porDono.has(k.lider_funcionario_id)) porDono.set(k.lider_funcionario_id, []);
            porDono.get(k.lider_funcionario_id).push(k);
          } else semDono.push(k);
        });



        const profilePorFunc = new Map();
        if (porDono.size > 0) {
          const { data: funcs, error: eFuncs } = await supabase
            .from('rh_funcionarios')
            .select('id, email')
            .in('id', [...porDono.keys()]);
          if (eFuncs) {
            console.warn('[notif] kpis semanais: nao resolvi os donos, avisando a fila geral');
            porDono.forEach(lista => semDono.push(...lista));
            porDono.clear();
          } else {
            const emails = (funcs || []).map(f => (f.email || '').toLowerCase()).filter(Boolean);
            const { data: profs } = emails.length
              ? await supabase.from('profiles').select('id, email').in('email', emails)
              : { data: [] };
            const idPorEmail = new Map((profs || []).map(pr => [(pr.email || '').toLowerCase(), pr.id]));
            (funcs || []).forEach(f => {
              const pid = idPorEmail.get((f.email || '').toLowerCase());
              if (pid) profilePorFunc.set(f.id, pid);
            });
          }
        }

        const avisar = async ({ lista, targetIds }) => {
          if (!lista.length) return;
          const nomes = amostraNomes(lista.map(k => k.indicador), 3);
          const seu = targetIds ? 'Seus' : 'Há';
          count += await notificar({
            modulo: 'kpis',
            tipo: 'kpis_semanais_pendentes',
            titulo: `${lista.length} KPI(s) semanal(is) sem dado em ${semanaCobrada}`,
            mensagem: `${seu} ${plural(lista.length, 'indicador semanal', 'indicadores semanais')} sem valor na semana ${semanaCobrada}${nomes ? `: ${nomes}` : ''}.`,
            link: '/painel',
            severidade: 'info',



            chaveDedup: `kpis_semanais_${semanaCobrada}_${targetIds ? targetIds.join('_') : 'fila'}`,
            ...(targetIds ? { targetIds } : {}),
          });
        };

        for (const [funcId, lista] of porDono.entries()) {
          const pid = profilePorFunc.get(funcId);
          if (pid) await avisar({ lista, targetIds: [pid] });
          else semDono.push(...lista);
        }
        await avisar({ lista: semDono });
      }
    }
  }

  return count;
}






async function gerarNotificacoesSolicitacoes() {
  let count = 0;
  const agora = new Date();
  const ha24h = new Date(agora.getTime() - 24 * 3600 * 1000).toISOString();
  const ha14d = new Date(agora.getTime() - 14 * 86400 * 1000).toISOString();

  const { data: concluidas } = await supabase
    .from('solicitacoes')
    .select('id, titulo, solicitante_id, concluido_em, categoria')
    .eq('status', 'concluido')
    .is('nps_nota', null)
    .not('solicitante_id', 'is', null)
    .gte('concluido_em', ha14d)
    .lte('concluido_em', ha24h);

  for (const s of concluidas || []) {

    count += await notificar({
      modulo: 'administrativo',
      tipo: 'solicitacao_avaliar_lembrete',
      titulo: `Lembrete: avalie "${s.titulo}"`,
      mensagem: 'Sua solicitação foi concluída · 30 segundos pra avaliar ajudam o time a melhorar.',
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solic_avaliar_${s.id}`,
      targetIds: [s.solicitante_id],
    });
  }




  const { data: aguardandoOrigem } = await supabase
    .from('solicitacoes')
    .select('id, titulo, aprovacao_origem_diretor_id, created_at')
    .eq('aprovacao_origem_status', 'pendente')
    .not('aprovacao_origem_diretor_id', 'is', null)
    .lte('created_at', ha24h)
    .is('deleted_at', null);

  const hojeKey = agora.toISOString().slice(0, 10);
  for (const s of aguardandoOrigem || []) {
    count += await notificar({
      modulo: 'administrativo',
      tipo: 'solicitacao_aprovacao_origem_lembrete',
      titulo: `Aguardando sua aprovação: ${s.titulo}`,
      mensagem: 'Solicitação do seu setor parada há mais de 24h aguardando sua decisão.',
      link: '/solicitacoes?aba=aprovar',
      severidade: 'alta',
      chaveDedup: `solic_aprov_origem_lembrete_${s.id}_${hojeKey}`,
      targetIds: [s.aprovacao_origem_diretor_id],
    });
  }





  try {
    const ha48h = new Date(agora.getTime() - 48 * 3600 * 1000).toISOString();
    const { data: aguardandoMerito, error: errMerito } = await supabase
      .from('solicitacoes')
      .select('id, titulo, updated_at')
      .eq('status', 'aguardando_merito')
      .lte('updated_at', ha48h)
      .is('deleted_at', null);
    if (!errMerito && (aguardandoMerito || []).length) {
      let aprovadoresMerito = [];
      const { data: aps, error: errAps } = await supabase
        .from('solicitacoes_merito_aprovadores')
        .select('profile_id');
      if (!errAps) aprovadoresMerito = (aps || []).map(a => a.profile_id).filter(Boolean);
      if (aprovadoresMerito.length) {
        for (const s of aguardandoMerito) {
          count += await notificar({
            modulo: 'administrativo',
            tipo: 'solicitacao_merito_lembrete',
            titulo: `Aguardando seu julgamento de mérito: ${s.titulo}`,
            mensagem: 'Solicitação parada há mais de 48h aguardando o julgamento de mérito.',
            link: '/solicitacoes?aba=aprovar',
            severidade: 'alta',
            chaveDedup: `solic_merito_lembrete_${s.id}_${hojeKey}`,
            targetIds: aprovadoresMerito,
          });
        }
      }
    }
  } catch (e) {
    console.warn('[Solicitacoes notify] merito:', e.message);
  }




  try {
    const { data: sobrestadas, error: errSob } = await supabase
      .from('solicitacoes')
      .select('id, titulo, sobrestada_em, sobrestada_revisao, sobrestada_status_anterior')
      .eq('status', 'sobrestada')
      .is('deleted_at', null);
    if (!errSob) {
      const hojeData = hojeKey;
      const limite30d = agora.getTime() - 30 * 86400 * 1000;
      for (const s of sobrestadas || []) {
        const revisaoVencida = s.sobrestada_revisao && String(s.sobrestada_revisao) <= hojeData;
        const semRevisao30d = !s.sobrestada_revisao && s.sobrestada_em
          && new Date(s.sobrestada_em).getTime() <= limite30d;
        if (!revisaoVencida && !semRevisao30d) continue;
        const modulo = s.sobrestada_status_anterior === 'aguardando_aprovacao_financeira'
          ? 'financeiro' : 'administrativo';
        count += await notificar({
          modulo,
          tipo: 'solicitacao_sobrestada_revisao',
          titulo: `Sobrestada aguardando revisão: ${s.titulo}`,
          mensagem: revisaoVencida
            ? `A data de revisão do sobrestamento chegou (${String(s.sobrestada_revisao).split('-').reverse().join('/')}) · decida: retomar ou manter em espera.`
            : 'Solicitação sobrestada há mais de 30 dias sem data de revisão definida · decida: retomar ou definir um prazo.',
          link: '/solicitacoes',
          severidade: 'alta',
          chaveDedup: `solic_sobrestada_revisao_${s.id}_${hojeKey}`,
        });
      }
    }
  } catch (e) {
    console.warn('[Solicitacoes notify] sobrestadas:', e.message);
  }

  return count;
}





async function gerarNotificacoesMarketing() {
  let count = 0;
  const agora = new Date();
  const ha24h = new Date(agora.getTime() - 24 * 3600 * 1000).toISOString();
  const hojeKey = agora.toISOString().slice(0, 10);

  const { data: cards, error } = await supabase
    .from('marketing_kanban_cards')
    .select('id, titulo, solicitacao_id, estado, estado_atualizado_em')
    .eq('estado', 'aguardando_solicitante')
    .is('deleted_at', null)
    .lte('estado_atualizado_em', ha24h);

  if (error) {
    if (!String(error.message || '').includes('does not exist')) {
      console.warn('[Marketing notify] erro:', error.message);
    }
    return 0;
  }

  for (const c of cards || []) {
    if (!c.solicitacao_id) continue;
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('solicitante_id, titulo')
      .eq('id', c.solicitacao_id)
      .maybeSingle();
    if (!sol?.solicitante_id) continue;

    count += await notificar({
      modulo: 'marketing',
      tipo: 'marketing_aguardando_solicitante_lembrete',
      titulo: `Aguardando sua revisão: ${sol.titulo}`,
      mensagem: 'Preview Marketing parado há mais de 24h aguardando sua aprovação ou sugestão de revisão.',
      link: '/solicitacoes',
      severidade: 'alta',
      chaveDedup: `marketing_aguardando_lembrete_${c.id}_${hojeKey}`,
      targetIds: [sol.solicitante_id],
    });
  }

  return count;
}







async function gerarNotificacoesOnline() {
  let count = 0;
  const hojeKey = new Date().toISOString().slice(0, 10);
  try {
    const { verificarColetaOnline } = require('./onlineCollectors');
    const r = await verificarColetaOnline();


    if (!r.token.conectado) {
      count += await notificar({
        modulo: 'online',
        tipo: 'online_oauth_desconectado',
        titulo: 'YouTube desconectado · coleta online parada',
        mensagem: 'O canal do YouTube não esta conectado (sem token OAuth valido). Pico, views e demais metricas dos cultos online NÃO estão sendo coletadas. Reconecte em /online > Conectar canal.',
        link: '/online',
        severidade: 'alta',
        chaveDedup: `online_oauth_desconectado_${hojeKey}`,
      });
    } else if (r.token.degradado) {

      count += await notificar({
        modulo: 'online',
        tipo: 'online_oauth_erro',
        titulo: 'Coleta online com erro recente',
        mensagem: `A última coleta do YouTube reportou erro: ${String(r.token.last_error || '').slice(0, 180)}. Verifique a conexão em /online.`,
        link: '/online',
        severidade: 'media',
        chaveDedup: `online_oauth_erro_${hojeKey}`,
      });
    }


    for (const c of r.problemas || []) {
      count += await notificar({
        modulo: 'online',
        tipo: 'online_culto_sem_metricas',
        titulo: `Culto online sem dados: ${c.nome} (${c.data})`,
        mensagem: `A coleta automática não preencheu: ${c.faltando.join(', ')}. Pode ser falha do token OAuth, live não detectada ou latencia do YouTube. Verifique em /online.`,
        link: '/online',
        severidade: 'media',
        chaveDedup: `online_culto_sem_metricas_${c.id}_${hojeKey}`,
      });
    }



    for (const c of r.decisoesPendentes || []) {
      const dica = c.chat_detectou > 0
        ? ` O chat ao vivo detectou ~${c.chat_detectou} possível(is) decisão(oes) · confirme o número real.`
        : '';
      count += await notificar({
        modulo: 'integracao',
        tipo: 'online_decisoes_a_confirmar',
        titulo: `Confirme as decisões online: ${c.nome} (${c.data})`,
        mensagem: `O culto online de ${c.data} ainda não teve as decisoes/conversoes online confirmadas.${dica} Lance em /integracao (aba Cultos), mesmo que tenha sido zero.`,
        link: '/integracao',
        severidade: 'baixa',
        chaveDedup: `online_decisoes_a_confirmar_${c.id}_${hojeKey}`,
      });
    }
  } catch (e) {
    if (!String(e.message || '').includes('does not exist')) {
      console.warn('[Online notify] Erro:', e.message);
    }
  }
  return count;
}




async function rodarAnaliseFinanceiraDiaria() {
  try {
    const { rodarAnaliseDiaria } = require('./analiseFinanceira');
    const r = await rodarAnaliseDiaria();

    let count = 0;
    if (r.queda) count++;
    if (Array.isArray(r.sumidos)) count += r.sumidos.length;
    if (Array.isArray(r.atrasadas)) count += r.atrasadas.length;
    if (r.pico) count++;
    return count;
  } catch (e) {

    if (!String(e.message || '').includes('does not exist')) {
      console.warn('[Analise financeira] Erro:', e.message);
    }
    return 0;
  }
}




async function gerarNotificacoesKids() {
  let count = 0;
  const { data: ausentes, error } = await supabase
    .rpc('fn_kids_ausentes_consecutivos', { p_min: 3 });
  if (error) { console.error('[Notificações] Kids rpc:', error.message); return 0; }




  const lista = (ausentes || [])
    .map(c => ({ nome: c.nome, perdidos: Number(c.cultos_perdidos) || 0 }))
    .sort((a, b) => b.perdidos - a.perdidos);
  if (lista.length) {
    count += await notificar({
      modulo: 'kids',
      tipo: 'kids_crianca_ausente',
      titulo: `${lista.length} ${plural(lista.length, 'criança', 'crianças')} faltando no Kids`,
      mensagem: `Sem check-in há 3 cultos seguidos ou mais: `
        + `${amostraNomes(lista.map(c => `${c.nome} (${c.perdidos} cultos)`))}.`
        + ' Vale um contato com as famílias — a lista completa está em Crianças.',
      link: '/ministerial/totem-kids/criancas',
      severidade: 'aviso',
      chaveDedup: 'kids_crianca_ausente',
    });
  }
  return count;
}






















async function gerarNotificacoesLgpdExclusao() {
  const { data, error } = await supabase
    .from('app_solicitacoes_exclusao')
    .select('id, criada_em')
    .eq('status', 'pendente')
    .order('criada_em', { ascending: true })
    .limit(200);
  if (error || !data || !data.length) return 0;

  const maisAntigo = data[0].criada_em ? new Date(data[0].criada_em) : null;
  const dias = maisAntigo
    ? Math.floor((Date.now() - maisAntigo.getTime()) / 86400000)
    : 0;

  const estourou = dias >= 15;

  await notificar({
    modulo: 'membresia',
    tipo: 'lgpd_exclusao_pendente',
    titulo: estourou
      ? `⚠️ Pedido de exclusao de conta ha ${dias} dias (prazo LGPD estourado)`
      : `${data.length} pedido(s) de exclusao de conta aguardando`,
    mensagem:
      `${data.length} pessoa(s) pediram exclusao da conta pelo app e ainda estao `
      + `como pendente. O mais antigo tem ${dias} dia(s) — o prazo da LGPD (art. 18) `
      + 'e de 15 dias. A desativacao ainda e manual.',
    link: '/ministerial/membresia?tab=cadastros',
    severidade: estourou ? 'urgente' : 'aviso',


    chaveDedup: `lgpd_exclusao_pendente_${new Date().toISOString().slice(0, 10)}`,
  });
  return 1;
}

module.exports = { gerarTodasNotificacoes, gerarNotificacoesOnline };

async function gerarNotificacoesSelecaoInterna() {
  const { count, error } = await supabase.from('rh_selecao_inscricoes').select('id', { count: 'exact', head: true }).eq('status', 'recebida').is('deleted_at', null).lt('criado_em', new Date(Date.now() - 3 * 86400000).toISOString());
  if (error) throw error;
  if (!count) return 0;
  return notificar({ modulo: 'rh', tipo: 'rh_selecao_pendente', titulo: 'Candidaturas internas aguardando análise', mensagem: `${count} inscrição(ões) aguardam análise há mais de três dias.`, link: '/admin/rh?tab=processos-seletivos', chaveDedup: `rh_selecao_pendente_${new Date().toISOString().slice(0,10)}` });
}
