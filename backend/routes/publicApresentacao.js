









const router = require('express').Router();
const kidsVisitante = require('../utils/kidsVisitante');

function hojeBRTKids() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const {
  honeypotPreenchido, temAbreviacaoNome, validarNascimento, SEXOS, TEXTOS,
  processarIdentidade, registrarConsentimentos, normalizarCpf, normalizarEmail,
  emailValido,
} = require('../services/inscricaoContrato');



const { normalizarSaude } = require('../utils/saudeCrianca');




const { escolherHorarioPara } = require('../services/apresentacaoHorarios');
const { exigeConfirmacaoPaisIguais, rotuloHorarioApresentacao } = require('../utils/apresentacaoHorario');

const multer = require('multer');
const { caminhoFotoValido, extensaoDeMime, PREFIXO_FOTO } = require('../utils/fotoApresentacao');
const { randomUUID } = require('crypto');

const { donoDoCpf, nomeDoDonoDoCpf, distribuirCpfs } = require('../utils/cpfResponsavel');



const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_FORM_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 600 : 5000),
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições deste endereço. Tente novamente em alguns minutos.' },
});
router.use(limiter);


function segundoDomingo(year, month) {
  const primeiro = new Date(year, month, 1);
  const offset = (7 - primeiro.getDay()) % 7;
  return new Date(year, month, 1 + offset + 7);
}

function fmtLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function proximoSegundoDomingoISO() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let year = hoje.getFullYear();
  let month = hoje.getMonth();
  let d = segundoDomingo(year, month);
  if (d < hoje) {
    month += 1;
    if (month > 11) { year += 1; month = 0; }
    d = segundoDomingo(year, month);
  }
  return fmtLocalISO(d);
}



function idadeTexto(nascISO, refISO) {
  const n = new Date(`${nascISO}T12:00:00`);
  const r = new Date(`${refISO}T12:00:00`);
  const dias = Math.floor((r.getTime() - n.getTime()) / 86400000);
  if (Number.isNaN(dias) || dias < 0) return null;
  if (dias < 60) return `${dias} dias`;
  let meses = (r.getFullYear() - n.getFullYear()) * 12 + (r.getMonth() - n.getMonth());
  if (r.getDate() < n.getDate()) meses -= 1;
  if (meses < 24) return `${meses} meses`;
  return `${Math.floor(meses / 12)} anos`;
}

function nomeCompletoOk(nome) {
  const n = String(nome || '').trim().replace(/\s+/g, ' ');
  return n.length >= 5 && n.split(' ').length >= 2 && !temAbreviacaoNome(n);
}





router.get('/proxima-data', async (_req, res) => {
  const data_apresentacao = proximoSegundoDomingoISO();
  const h = await escolherHorarioPara(data_apresentacao);
  res.json({
    data_apresentacao,
    horario_previsto: h.horario,
    horario_previsto_rotulo: h.horario ? rotuloHorarioApresentacao(h.horario, h.configurados) : null,
  });
});



router.get('/textos', (_req, res) => {
  res.json({
    menor_responsavel: TEXTOS.menor_responsavel,
    imagem: TEXTOS.imagem,
    aviso_optin: TEXTOS.aviso_optin,
  });
});






















const uploadFoto = multer({
  storage: multer.memoryStorage(),


  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, Boolean(extensaoDeMime(file.mimetype))),
});

router.post('/foto', uploadFoto.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem JPG, PNG ou WEBP de até 8MB.' });
    const ext = extensaoDeMime(req.file.mimetype);
    if (!ext) return res.status(400).json({ error: 'Formato não aceito. Use JPG, PNG ou WEBP.' });
    const caminho = `${PREFIXO_FOTO}${randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from('kids-documentos')
      .upload(caminho, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (error) throw error;
    res.json({ foto_path: caminho });
  } catch (e) {
    console.error('[publicApresentacao] upload de foto:', e.message);
    res.status(500).json({ error: 'Não conseguimos guardar a foto. Você pode enviar a inscrição sem ela.' });
  }
});



router.use('/foto', (err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'A foto passa de 8MB. Envie uma versão menor.' });
  console.error('[publicApresentacao] multer:', err && err.message);
  res.status(400).json({ error: 'Não conseguimos ler esse arquivo. Use JPG, PNG ou WEBP.' });
});


router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const {
      nome_pai, nome_mae, criancas, crianca_nome, crianca_idade, telefone,
      cpf_responsavel, cpf_de, cpf_outro, email, endereco, observacoes,
      aceita_termos_menor, consent_imagem, whatsapp_optin, pais_iguais_confirmado,
    } = body;

    if (honeypotPreenchido(body)) return res.json({ ok: true });


    const listaBruta = Array.isArray(criancas) && criancas.length
      ? criancas
      : [{ nome: crianca_nome, idade: crianca_idade }];
    const lista = listaBruta
      .map(c => ({
        nome: String(c?.nome || '').trim().replace(/\s+/g, ' ').slice(0, 200),
        nascimento: validarNascimento(c?.data_nascimento),
        sexo: SEXOS.includes(String(c?.sexo || '').toLowerCase()) ? String(c.sexo).toLowerCase() : null,
        idade: c?.idade ? String(c.idade).trim().slice(0, 60) : null,



        saude: normalizarSaude(c),





        fotoPath: caminhoFotoValido(c && c.foto_path) ? c.foto_path : null,
      }))
      .filter(c => c.nome.length >= 2);

    if (!lista.length) return res.status(400).json({ error: 'Informe o nome de ao menos uma criança.' });


    for (const c of lista) {
      if (!nomeCompletoOk(c.nome)) return res.status(400).json({ error: `Escreva o nome completo da criança, sem abreviações (${c.nome}).` });
      if (!c.nascimento) return res.status(400).json({ error: `Informe a data de nascimento de ${c.nome}.` });
      if (!c.sexo) return res.status(400).json({ error: `Selecione o sexo de ${c.nome}.` });
    }


    const nomePaiT = nome_pai ? String(nome_pai).trim().replace(/\s+/g, ' ').slice(0, 200) : null;
    const nomeMaeT = nome_mae ? String(nome_mae).trim().replace(/\s+/g, ' ').slice(0, 200) : null;
    if (!nomePaiT && !nomeMaeT) return res.status(400).json({ error: 'Informe o nome do pai ou da mãe.' });
    for (const n of [nomePaiT, nomeMaeT]) {
      if (n && !nomeCompletoOk(n)) return res.status(400).json({ error: 'Escreva o nome completo do pai/mãe, sem abreviações.' });
    }











    if (exigeConfirmacaoPaisIguais(nomePaiT, nomeMaeT, pais_iguais_confirmado)) {
      return res.status(400).json({
        codigo: 'pais_iguais',
        error: 'O nome do pai e o da mãe estão iguais. Confirme que é a mesma pessoa para seguir.',
      });
    }

    const tel = String(telefone || '').replace(/\D+/g, '');
    if (tel.length < 10 || tel.length > 11) return res.status(400).json({ error: 'Informe um telefone válido com DDD.' });

    const cpfDig = normalizarCpf(cpf_responsavel);
    if (!cpfDig) return res.status(400).json({ error: 'Informe um CPF válido do responsável.' });









    const donoCpf = donoDoCpf({
      informado: cpf_de,
      temPai: Boolean(nomePaiT),
      temMae: Boolean(nomeMaeT),
    });


    const cpfOutroDig = cpf_outro ? normalizarCpf(cpf_outro) : null;
    const cpfsDosPais = distribuirCpfs({ dono: donoCpf, cpf: cpfDig, cpfOutro: cpfOutroDig });

    const emailNorm = normalizarEmail(email);
    if (!emailNorm || !emailValido(emailNorm)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }


    if (!aceita_termos_menor) {
      return res.status(400).json({ error: 'É preciso aceitar a autorização de responsável para inscrever a criança.' });
    }

    const enderecoT = endereco ? String(endereco).trim().slice(0, 300) : null;
    const optin = Boolean(whatsapp_optin);
    const dataApresentacao = proximoSegundoDomingoISO();
    const obsExtra = observacoes ? String(observacoes).trim().slice(0, 1000) : null;



    const criados = [];
    const criancaIds = [];
    const jaInscritas = [];



    const escolha = await escolherHorarioPara(dataApresentacao);
    let horarioFamilia = escolha.horario;
    let catalogoHorarios = escolha.configurados;

    for (const c of lista) {
      const { data: dup, error: eDup } = await supabase
        .from('apresentacao_criancas')
        .select('id, horario_culto')
        .eq('cpf_responsavel', cpfDig)
        .eq('data_apresentacao', dataApresentacao)
        .ilike('crianca_nome', c.nome)
        .neq('status', 'cancelado')
        .is('deleted_at', null)
        .limit(1);
      if (eDup) throw eDup;
      if (dup && dup.length) {
        jaInscritas.push(c.nome);
        if (dup[0].horario_culto) horarioFamilia = dup[0].horario_culto;
        continue;
      }



      let criancaId = null;
      try {
        const { data: kidDup } = await supabase
          .from('kids_criancas')
          .select('id, tem_alergia, alergia_qual, tem_espectro, espectro_qual, tem_limitacao_fisica, limitacao_fisica_qual')
          .ilike('nome', c.nome)
          .eq('data_nascimento', c.nascimento)
          .eq('ativo', true)
          .limit(1);
        if (kidDup && kidDup.length) {
          criancaId = kidDup[0].id;




          const patch = {};
          for (const [k, v] of Object.entries(c.saude)) {
            if (kidDup[0][k] === null || kidDup[0][k] === undefined) patch[k] = v;
          }
          if (Object.keys(patch).length) {
            await supabase.from('kids_criancas').update(patch).eq('id', criancaId);
          }
        } else {
          const obsInterna = `Cadastrado via formulário de Apresentação de Crianças (${dataApresentacao}). `
            + `Pais: ${nomePaiT || '—'} / ${nomeMaeT || '—'}.`;
          const { data: kid } = await supabase
            .from('kids_criancas')
            .insert({
              nome: c.nome,
              data_nascimento: c.nascimento,
              sexo: c.sexo === 'masculino' ? 'M' : 'F',
              visitante: true,





        data_limite: kidsVisitante.prazoDe(hojeBRTKids()),
              observacoes_internas: obsInterna,
              ...c.saude,
            })
            .select('id').single();
          criancaId = kid?.id || null;
        }
      } catch (e) {
        console.error('[publicApresentacao] cadastro kids_criancas falhou:', e.message);
      }

      const linhaInsc = {
          nome_pai: nomePaiT,
          nome_mae: nomeMaeT,
          crianca_nome: c.nome,
          crianca_idade: c.idade || idadeTexto(c.nascimento, dataApresentacao),
          crianca_data_nascimento: c.nascimento,
          crianca_sexo: c.sexo,
          telefone: tel,
          cpf_responsavel: cpfDig,


          ...(cpfsDosPais.cpf_pai ? { cpf_pai: cpfsDosPais.cpf_pai } : {}),
          ...(cpfsDosPais.cpf_mae ? { cpf_mae: cpfsDosPais.cpf_mae } : {}),
          email: emailNorm,
          endereco: enderecoT,
          data_apresentacao: dataApresentacao,




          ...(horarioFamilia ? { horario_culto: horarioFamilia } : {}),




          ...(c.fotoPath ? { foto_storage_path: c.fotoPath, foto_enviada_em: new Date().toISOString() } : {}),
          status: 'pendente',
          origem: 'publico',
          crianca_id: criancaId,
          observacoes: obsExtra,
      };






      const OPCIONAIS_INSC = ['foto_storage_path', 'foto_enviada_em', 'cpf_pai', 'cpf_mae'];
      const inserir = (linha) => supabase.from('apresentacao_criancas').insert(linha).select('id').single();
      const linhaAtual = { ...linhaInsc };
      let { data, error } = await inserir(linhaAtual);
      while (error && error.code === '42703') {
        const faltando = OPCIONAIS_INSC.find((c) => (error.message || '').includes(c));


        if (!faltando || !(faltando in linhaAtual)) break;
        console.warn(`[publicApresentacao] coluna ${faltando} ausente (migration não aplicada) — inscrevendo sem ela`);
        delete linhaAtual[faltando];
        ({ data, error } = await inserir(linhaAtual));
      }
      if (error) {
        console.error('[publicApresentacao] insert error:', error.message);
        continue;
      }
      criados.push(data.id);
      if (criancaId) criancaIds.push(criancaId);
    }

    if (!criados.length && !jaInscritas.length) return res.status(500).json({ error: 'Erro ao enviar inscrição.' });

    if (criados.length) {





      const gravarConsentimentos = (membroId) => Promise.all(criados.map((id) => registrarConsentimentos({
        porta: 'apresentacao', refId: id, membroId: membroId || null,
        ip: req.ip || null, userAgent: req.headers['user-agent'] || null,
        itens: [
          { tipo: 'menor_responsavel', aceito: true },
          { tipo: 'whatsapp', aceito: optin },
          { tipo: 'imagem', aceito: Boolean(consent_imagem) },
        ],
      })));
      gravarConsentimentos(null)
        .catch((err) => console.error('[publicApresentacao] consentimentos:', err.message));









      const nomeResp = nomeDoDonoDoCpf(donoCpf, nomePaiT, nomeMaeT);
      processarIdentidade({
        nomeCompleto: nomeResp, cpf: cpfDig, email: emailNorm, telefone: tel,
        politica: 'ligar', origem: 'apresentacao_formulario', origemId: criados[0],
      }).then(async (ident) => {
        if (ident.membroId) {
          const { error: eR } = await supabase.from('apresentacao_criancas')
            .update({ responsavel_membro_id: ident.membroId }).in('id', criados);
          if (eR) console.error('[publicApresentacao] responsavel_membro_id:', eR.message);



          if (optin) {
            const { error: eO } = await supabase.from('mem_membros')
              .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
              .eq('id', ident.membroId).eq('whatsapp_optin', false).is('deleted_at', null);
            if (eO) console.error('[publicApresentacao] optin membro:', eO.message);
          }

          const parentesco = nomeMaeT && !nomePaiT ? 'mae' : (nomePaiT && !nomeMaeT ? 'pai' : null);
          for (const cid of criancaIds) {






            const { error: eV } = await supabase.from('kids_responsaveis').upsert({
              crianca_id: cid, membro_id: ident.membroId, parentesco,
              autorizado_buscar: false,
              observacao: `Vínculo criado pela inscrição pública de apresentação (${dataApresentacao}) — retirada NÃO autorizada por esta via.`,
            }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: true });
            if (eV) console.error('[publicApresentacao] kids_responsaveis:', eV.message);
          }
        }
      }).catch((err) => console.error('[publicApresentacao] identidade:', err.message));

      const nomes = lista.map(c => c.nome).join(', ');
      const rotuloH = rotuloHorarioApresentacao(horarioFamilia, catalogoHorarios);













      notificar({
        modulo: 'kids',
        tipo: 'nova_apresentacao_crianca',
        titulo: criados.length > 1 ? 'Nova apresentação de crianças' : 'Nova apresentação de criança',
        mensagem: `${nomes} — inscriç${criados.length > 1 ? 'ões' : 'ão'} para a apresentação de ${dataApresentacao}`
          + (rotuloH ? ` · ${rotuloH}.` : '. Sem horário atribuído (catálogo cheio ou indisponível) — definir na tela do Kids.')
          + (escolha.lotado ? ' ⚠️ Todos os horários estão lotados.' : ''),




        link: criados.length === 1
          ? `/ministerial/totem-kids/apresentacao?id=${criados[0]}`
          : '/ministerial/totem-kids/apresentacao',
        severidade: 'info',
        chaveDedup: `apresentacao_crianca_${criados[0]}`,
      }).catch(err => console.error('[publicApresentacao] notificacao falhou:', err.message));
    }

    res.status(201).json({
      ok: true, ids: criados, ja_inscritas: jaInscritas, data_apresentacao: dataApresentacao,

      horario_culto: horarioFamilia,
      horario_rotulo: rotuloHorarioApresentacao(horarioFamilia, catalogoHorarios),
    });
  } catch (e) {
    console.error('[publicApresentacao] erro:', e.message);
    res.status(500).json({ error: 'Erro ao enviar inscrição.' });
  }
});

module.exports = router;
