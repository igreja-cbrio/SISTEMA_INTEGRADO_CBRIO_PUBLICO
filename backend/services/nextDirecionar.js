














const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { acharOuCriarGuardado } = require('./membroMatch');



const { sexoPara } = require('../utils/dadosDoCadastro');




const { avaliarHorarioBatismo } = require('../utils/batismoHorario');
const {
  horariosConfigurados,
  ocupacaoPorHorario,
  dataProximoBatismo,
} = require('./batismoHorarios');


const NEXT_DIRECIONA = {
  grupos:      { flag: 'indicou_grupo',      destino: 'grupos',      valor_alvo: 'conectar', modulo: 'grupos',       label: 'Grupos',      link: '/grupos' },
  voluntarios: { flag: 'indicou_servir',     destino: 'voluntarios', valor_alvo: 'servir',   modulo: 'voluntariado', label: 'Voluntários', link: '/ministerial/voluntariado/encaminhados' },
  batismo:     { flag: 'indicou_batismo' },
  devocional:  { flag: 'indicou_devocional' },
};



function deriveAreaCanonica(canonicas) {
  const set = new Set((canonicas || []).map(c => String(c || '').toLowerCase()));
  if (set.has('kids')) return 'kids';
  if (set.has('bridge')) return 'bridge';
  if (set.has('ami')) return 'ami';
  if (set.has('online')) return 'online';
  return 'sede';
}



async function resolverAreasVol(labels) {
  const escolhidos = (Array.isArray(labels) ? labels : []).map(s => String(s || '').trim()).filter(Boolean);
  if (escolhidos.length === 0) return { labels: [], area: 'sede' };
  const { data: opcoes } = await supabase
    .from('vol_form_opcoes')
    .select('label, area_canonica')
    .eq('ativo', true);
  const mapa = new Map((opcoes || []).map(o => [o.label, o.area_canonica]));
  const validos = escolhidos.filter(l => mapa.has(l));
  const usar = validos.length ? validos : escolhidos;
  const canonicas = usar.map(l => mapa.get(l)).filter(Boolean);
  return { labels: usar, area: deriveAreaCanonica(canonicas) };
}





const CRON_SECRET = process.env.CRON_SECRET || '';
const DIRECIONAR_PAYLOAD = 'next-direcionar-v1';

function signDirecionarToken() {
  if (!CRON_SECRET) return null;
  const sig = crypto.createHmac('sha256', CRON_SECRET).update(DIRECIONAR_PAYLOAD).digest('hex').slice(0, 24);
  return Buffer.from(`${DIRECIONAR_PAYLOAD}.${sig}`).toString('base64url');
}

function verifyDirecionarToken(token) {
  if (!CRON_SECRET || !token) return false;
  try {
    const raw = Buffer.from(String(token), 'base64url').toString('utf8');
    const [payload, sig] = raw.split('.');
    if (payload !== DIRECIONAR_PAYLOAD || !sig) return false;
    const expected = crypto.createHmac('sha256', CRON_SECRET).update(DIRECIONAR_PAYLOAD).digest('hex').slice(0, 24);
    return sig === expected;
  } catch (_) { return false; }
}




async function direcionarMatricula({ matriculaId, destinos = [], areas = [], horarioBatismo = null, userId = null, permitir = null }) {
  const validos = (Array.isArray(destinos) ? destinos : [])
    .filter(d => NEXT_DIRECIONA[d] && (!permitir || permitir.includes(d)));
  if (validos.length === 0) { const e = new Error('Informe ao menos um destino válido'); e.status = 400; throw e; }

  const { data: m, error: em } = await supabase
    .from('next_matriculas')
    .select('id, turma_id, nome, sobrenome, cpf, telefone, email, data_nascimento, sexo, membro_id, indicou_grupo, indicou_servir, indicou_batismo, indicou_devocional')
    .eq('id', matriculaId).is('deleted_at', null).single();
  if (em) throw em;

  const nomeCompleto = `${m.nome || ''} ${m.sobrenome || ''}`.trim() || m.nome || 'Sem nome';














  let batismo = null;
  if (validos.includes('batismo')) {
    const dataBat = await dataProximoBatismo();
    const [configurados, ocupacao] = await Promise.all([
      horariosConfigurados(),
      dataBat ? ocupacaoPorHorario(dataBat) : Promise.resolve({}),
    ]);
    const av = avaliarHorarioBatismo(horarioBatismo, {
      configurados: dataBat ? configurados : null,
      ocupacao,
      exigir: true,
    });
    if (!av.ok) {
      const e = new Error(av.mensagem);

      e.status = av.motivo === 'obrigatorio' ? 400 : 409;
      e.codigo = `horario_${av.motivo}`;
      e.campo = 'horario_batismo';
      throw e;
    }
    batismo = { horario: av.horario, data: dataBat };
  }


  const flags = { updated_at: new Date().toISOString() };
  for (const d of validos) flags[NEXT_DIRECIONA[d].flag] = true;
  await supabase.from('next_matriculas').update(flags).eq('id', m.id);


  let membroId = m.membro_id || null;
  async function garantirMembro() {
    if (membroId) return membroId;
    try {
      const r = await acharOuCriarGuardado({ cpf: m.cpf || null, telefone: m.telefone || null, nome: nomeCompleto, dataNascimento: m.data_nascimento || null, status: 'visitante', origem: 'next_direcionamento', origemId: m.id });
      membroId = r?.membro_id || null;
      if (membroId) await supabase.from('next_matriculas').update({ membro_id: membroId }).eq('id', m.id);
    } catch (e) { console.error('[nextDirecionar] acharOuCriarGuardado:', e.message); }
    return membroId;
  }













  let cadastro = null;
  async function dadosDaPessoa() {
    if (cadastro === null && membroId) {
      try {
        const { data } = await supabase.from('mem_membros')
          .select('cpf, data_nascimento, genero, email, telefone')
          .eq('id', membroId).is('deleted_at', null).maybeSingle();
        cadastro = data || false;
      } catch (e) {
        console.warn('[nextDirecionar] cadastro:', e.message);
        cadastro = false;
      }
    }
    const c = cadastro || {};
    const naoVazio = (v) => v !== null && v !== undefined && String(v).trim() !== '';
    return {
      cpf: naoVazio(m.cpf) ? m.cpf : (c.cpf || null),
      email: naoVazio(m.email) ? m.email : (c.email || null),
      telefone: naoVazio(m.telefone) ? m.telefone : (c.telefone || null),
      data_nascimento: naoVazio(m.data_nascimento) ? m.data_nascimento : (c.data_nascimento || null),


      sexo: naoVazio(m.sexo) ? m.sexo : (c.genero || null),
    };
  }

  const criados = {};
  for (const d of validos) {
    const cfg = NEXT_DIRECIONA[d];
    if (d === 'voluntarios' && Array.isArray(areas) && areas.length > 0) {


      const { data: ja } = await supabase.from('vol_inscricoes').select('id')
        .eq('next_matricula_id', m.id).is('deleted_at', null).limit(1).maybeSingle();
      if (!ja) {
        await garantirMembro();
        const { labels, area } = await resolverAreasVol(areas);
        const p = await dadosDaPessoa();
        const partes = String(m.nome || '').trim().split(/\s+/);
        await supabase.from('vol_inscricoes').insert({
          nome: partes[0] || (m.nome || 'Voluntário'),
          sobrenome: m.sobrenome || partes.slice(1).join(' ') || '',
          nome_completo: nomeCompleto,
          cpf: p.cpf, email: p.email, telefone: p.telefone,
          data_nascimento: p.data_nascimento, nome_mae: null,
          sexo: sexoPara('canonico', p.sexo),
          data_inscricao: new Date().toISOString(),
          participou_next: 'True',
          ministerios_interesse: labels.join(', '),
          area, status: 'inscrito', primeiro_contato_em: 'False',
          membro_id: membroId || m.membro_id || null,
          origem: 'next', next_matricula_id: m.id,
        });
        await supabase.from('next_matriculas').update({ indicou_servir: true, updated_at: new Date().toISOString() }).eq('id', m.id);
        notificar({
          modulo: 'voluntariado', titulo: 'Interesse em servir (veio do NEXT)',
          mensagem: `${nomeCompleto} quer servir${labels.length ? ` em: ${labels.join(', ')}` : ''} (via NEXT). Faça o primeiro contato.`,
          link: '/ministerial/voluntariado/inscricoes',
        }).catch(() => {});
        criados.voluntarios = true;
      }
    } else if (d === 'grupos' || d === 'voluntarios') {
      const { data: ja } = await supabase.from('jornada_encaminhamentos').select('id')
        .eq('next_matricula_id', m.id).eq('destino', cfg.destino).is('deleted_at', null)
        .limit(1).maybeSingle();
      if (!ja) {
        await supabase.from('jornada_encaminhamentos').insert({
          origem: 'next', next_matricula_id: m.id, membro_id: membroId || m.membro_id || null,
          nome: nomeCompleto, telefone: m.telefone || null, destino: cfg.destino,
          valor_alvo: cfg.valor_alvo, encaminhado_por: userId,
        });
        notificar({
          modulo: cfg.modulo, titulo: `Direcionado pra ${cfg.label} no NEXT`,
          mensagem: `${nomeCompleto} foi direcionado(a) pra ${cfg.label} no NEXT. Faça o primeiro contato e registre a devolutiva.`,
          link: cfg.link,
        }).catch(() => {});
        criados[d] = true;
      }
    } else if (d === 'batismo') {
      await garantirMembro();
      let ja = null;
      if (membroId) {
        const { data } = await supabase.from('batismo_inscricoes')
          .select('id, data_batismo, horario_culto')
          .eq('membro_id', membroId).in('status', ['pendente', 'confirmado']).limit(1).maybeSingle();
        ja = data;
      }
      if (!ja) {
        const p = await dadosDaPessoa();
        const partes = String(m.nome || '').trim().split(/\s+/);
        await supabase.from('batismo_inscricoes').insert({
          nome: partes[0] || (m.nome || 'Convertido'),
          sobrenome: m.sobrenome || partes.slice(1).join(' ') || '',
          cpf: p.cpf, telefone: p.telefone, membro_id: membroId || null,


          data_nascimento: p.data_nascimento, email: p.email,
          sexo: sexoPara('curto', p.sexo),



          data_batismo: batismo.data, horario_culto: batismo.horario,
          status: 'pendente', origem: 'next', observacoes: 'Direcionado pelo NEXT', inscrito_por: userId,
        });
        notificar({
          modulo: 'integracao', titulo: 'Direcionado pra Batismo no NEXT',
          mensagem: `${nomeCompleto} foi direcionado(a) pro batismo no NEXT.`,
          link: '/ministerial/integracao?tab=batismos',
        }).catch(() => {});
        criados.batismo = true;
      } else if (batismo && !ja.horario_culto
                 && (!ja.data_batismo || ja.data_batismo === batismo.data)) {












        const { data: atualizadas } = await supabase.from('batismo_inscricoes')
          .update({
            horario_culto: batismo.horario,
            data_batismo: ja.data_batismo || batismo.data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ja.id).is('horario_culto', null)
          .select('id');
        if (atualizadas && atualizadas.length) criados.batismo_horario_atualizado = true;
      }
    } else if (d === 'devocional') {

      criados.devocional = true;
    }
  }

  return { ok: true, destinos: validos, criados, turma_id: m.turma_id };
}

module.exports = { NEXT_DIRECIONA, signDirecionarToken, verifyDirecionarToken, direcionarMatricula };
