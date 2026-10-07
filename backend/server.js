require('dotenv').config();



const { initSentryBackend, sentryRequestHandler, sentryErrorHandler } = require('./utils/sentry');
initSentryBackend();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const { requestContext } = require('./middleware/requestContext');
const { systemJobTracking } = require('./middleware/systemJobTracking');
const { setSystemJobOutcome } = require('./services/systemJobOutcome');
const { criarTelemetria500 } = require('./middleware/telemetria500');
const { createCorsOriginValidator } = require('./utils/corsPolicy');
const { createErrorHandler, requestRoute } = require('./middleware/errorHandler');

const app = express();



app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;



app.use(sentryRequestHandler());
app.use(requestContext);


app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(cors({
  origin: createCorsOriginValidator(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],







  maxAge: 86400,
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 500 : 5000),
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },









  skip: (req) => process.env.NODE_ENV !== 'production'
    || req.path.startsWith('/api/public/nps')
    || req.path.startsWith('/api/public/grupos')
    || req.path.startsWith('/api/public/evento')
    || req.path.startsWith('/api/public/membresia')





    || req.path.startsWith('/api/public/decisao-culto')
    || req.path.startsWith('/api/public/decisao-online')



    || req.path.startsWith('/api/public/visitante')



    || req.path.startsWith('/api/public/generosidade')






    || req.path.startsWith('/api/public/censo')




    || req.path.startsWith('/api/public/campanhas')





    || req.path.startsWith('/r/')
    || req.path.startsWith('/api/pagamentos-webhook')




    || req.path.startsWith('/api/totem')










    || req.path.startsWith('/api/app'),
}));
app.use(hpp());
app.use(compression());



app.use('/api/staff', express.json({ limit: '10mb' }));

app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));
app.use(systemJobTracking);




app.use(criarTelemetria500());


app.use('/api/telemetry', require('./routes/systemTelemetry'));
app.use('/api/app', require('./routes/app'));
app.use('/api/auth/planning-center', require('./routes/authPlanningCenter'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/comunicacao', require('./routes/comunicacao'));
app.use('/api/revisoes', require('./routes/revisoes'));
app.use('/api/events', require('./routes/events'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/campanhas', require('./routes/campanhas'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/expansion', require('./routes/expansion'));
app.use('/api/strategic', require('./routes/strategic'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/assistente-conversas', require('./routes/assistenteConversas'));
app.use('/api/agent-tasks', require('./routes/agentTasks'));
app.use('/api/rh-selecao', require('./routes/rhSelecao'));
app.use('/api/rh', require('./routes/rh'));



app.use('/api/avaliacao360', require('./routes/avaliacao360'));
app.use('/api/painel-rh', require('./routes/painelRh'));
app.use('/api/coberturas', require('./routes/coberturas'));
app.use('/api/pcs', require('./routes/pcs'));
app.use('/api/financeiro', require('./routes/financeiro'));
app.use('/api/financeiro-v2', require('./routes/financeiroV2'));

app.use('/api/santander/cron', require('./routes/santanderCron'));
app.use('/api/santander', require('./routes/santander'));
app.use('/api/logistica', require('./routes/logistica'));
app.use('/api/ml', require('./routes/ml'));
app.use('/api/arquivei', require('./routes/arquivei'));
app.use('/api/patrimonio', require('./routes/patrimonio'));
app.use('/api/cycles', require('./routes/cycles'));
app.use('/api/completions', require('./routes/completions'));
app.use('/api/events', require('./routes/reports'));
app.use('/api/occurrences', require('./routes/occurrences'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/notificacoes', require('./routes/notificacoes'));
app.use('/api/permissoes', require('./routes/permissoes'));
app.use('/api/membresia', require('./routes/membresia'));
app.use('/api/censo', require('./routes/censo'));
app.use('/api/links', require('./routes/links'));
app.use('/api/destaques', require('./routes/destaques'));
app.use('/api/batismo-fotos', require('./routes/batismoFotos'));


const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 30 : 5000),
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});




app.use('/api/public/nps', require('./routes/publicNps'));





app.use('/r', require('./routes/redirecionador'));



app.use('/api/public/censo', require('./routes/publicCenso'));

app.use('/api/public/familia', require('./routes/publicFamilia'));

app.use('/api/public/vol-email', require('./routes/publicVolEmail'));



app.use('/api/public/grupos', require('./routes/publicGrupos'));




app.use('/api/public/evento-checkin', require('./routes/publicEventoCheckin'));



app.use('/api/public/evento', require('./routes/publicEventoExterno'));






app.use('/api/public/voluntariado', require('./routes/publicVoluntariado'));
app.use('/api/public/next', require('./routes/publicNext'));
app.use('/api/public/batismo', require('./routes/publicBatismo'));
app.use('/api/public/apresentacao-criancas', require('./routes/publicApresentacao'));






app.use('/api/public/membresia', require('./routes/publicMembresia'));



app.use('/api/public/generosidade', require('./routes/publicGenerosidade'));







app.use('/api/public/decisao-culto', require('./routes/publicDecisaoCulto'));
app.use('/api/public/decisao-online', require('./routes/publicDecisaoOnline'));


app.use('/api/public/visitante', require('./routes/publicVisitante'));





app.use('/api/public/campanhas', require('./routes/publicCampanha'));






app.use('/api/public/rh-ficha-contratada', require('./routes/publicRhFichaContratada'));
app.use('/api/public', publicLimiter);

app.use('/api/public/rh-onboarding', require('./routes/publicRhOnboarding'));



app.use('/api/pagamentos-webhook', require('./routes/pagamentosWebhook'));






app.use('/api/totem', require('./routes/totem'));


app.use('/api/whatsapp/webhook', require('./routes/publicWhatsapp'));
app.use('/api/whatsapp', require('./routes/whatsapp'));

app.use('/api/whatsapp-grupos', require('./routes/whatsappGrupos'));

app.use('/api/whatsapp-cron', require('./routes/whatsappCron'));
app.use('/api/solicitacoes', require('./routes/solicitacoes'));
app.use('/api/producao', require('./routes/producao'));

app.use('/api/marketing/linha', require('./routes/marketingLinha'));

app.use('/api/marketing/painel', require('./routes/marketingPainel'));

app.use('/api/marketing/avisos-inicio', require('./routes/marketingAvisosInicio'));

app.use('/api/marketing/arquivos', require('./routes/marketingArquivos'));
app.use('/api/marketing', require('./routes/marketing'));
app.use('/api/cerebro', require('./routes/cerebro'));
app.use('/api/voluntariado', require('./routes/voluntariado'));
app.use('/api/voluntariado', require('./routes/voluntariado-sync'));
app.use('/api/face', require('./routes/face'));
app.use('/api/tutorial', require('./routes/tutorial'));
app.use('/api/grupos', require('./routes/grupos'));
app.use('/api/kpis/v2', require('./routes/kpisV2'));
app.use('/api/kpis', require('./routes/kpis'));
app.use('/api/online', require('./routes/online'));
app.use('/api/wifi', require('./routes/wifi'));
app.use('/api/cuidados', require('./routes/cuidados'));
app.use('/api/visitantes', require('./routes/visitantes'));
app.use('/api/next-convite', require('./routes/nextConvite'));
app.use('/api/wa-inbox', require('./routes/waInbox'));
app.use('/api/agente-primeiro-contato', require('./routes/agentePrimeiroContato'));
app.use('/api/monitor-automacoes', require('./routes/monitorAutomacoes'));
app.use('/api/agente-voluntariado', require('./routes/agenteVoluntariado'));
app.use('/api/agente-batismo-next', require('./routes/agenteBatismoNext'));
app.use('/api/integracao', require('./routes/integracao'));
app.use('/api/relatorios', require('./routes/relatorios'));
app.use('/api/eventos-externos', require('./routes/eventosExternos'));
app.use('/api/inscricoes', require('./routes/inscricoes'));
app.use('/api/next', require('./routes/next'));
const entradasRouter = require('./routes/nextBatismo');
app.use('/api/entradas', entradasRouter);
app.use('/api/next-batismo', entradasRouter);
app.use('/api/governanca', require('./routes/governanca'));



app.use('/api/ata-semanal', require('./routes/ataSemanal'));
app.use('/api/processos', require('./routes/processos'));
app.use('/api/tarefas', require('./routes/tarefas'));
app.use('/api/rotinas', require('./routes/rotinas'));
app.use('/api/jornada', require('./routes/jornada'));
app.use('/api/encaminhamentos', require('./routes/encaminhamentos'));
app.use('/api/devocionais', require('./routes/devocionais'));
app.use('/api/devocional-planos', require('./routes/devocionalPlanos'));
app.use('/api/devocional-membro', require('./routes/devocionalMembro'));
app.use('/api/public/devocional', require('./routes/publicDevocional'));
app.use('/api/bible', require('./routes/bible'));
app.use('/api/pessoas', require('./routes/pessoas'));
app.use('/api/nsm', require('./routes/nsm'));
app.use('/api/painel', require('./routes/painel'));
app.use('/api/painel-area', require('./routes/painelArea'));
app.use('/api/app-analytics', require('./routes/appAnalytics'));
app.use('/api/sistema', require('./routes/sistema'));
app.use('/api/sistema', require('./routes/sistemaV1').router);
app.use('/api/comunicados', require('./routes/comunicados'));
app.use('/api/totem-kids', require('./routes/totemKids'));
app.use('/api/estrategia', require('./routes/estrategia'));
app.use('/api/ritual', require('./routes/ritual'));
app.use('/api/gestao', require('./routes/gestao'));
app.use('/api/dados-brutos', require('./routes/dadosBrutos'));
app.use('/api/dashboard-semanal', require('./routes/dashboardSemanal'));
app.use('/api/nps', require('./routes/nps'));

app.use('/api/planejamento-anual', require('./routes/planejamentoAnual'));


app.use('/api/lgpd', require('./routes/lgpd'));
app.use('/api/feedback', require('./routes/feedback'));


let _cacheHealthDb = { em: 0, resp: null };



app.get('/api/health', (req, res) => {
  const { supabase } = require('./utils/supabase');
  setSystemJobOutcome(res, {
    status: 'success', effectStatus: 'confirmed', outputCount: 1,
    result: 'api_healthy',
  });
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase_client: !!supabase,
    supabase_url_set: !!process.env.SUPABASE_URL,
    supabase_service_role_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    database_url_set: !!process.env.DATABASE_URL,
    node_env: process.env.NODE_ENV || 'unknown',
  });
});












app.get('/api/health/db', async (req, res) => {
  const { sondar, respostaSaude, CACHE_MS } = require('./utils/saudeBanco');
  const agora = Date.now();
  let resp = (agora - _cacheHealthDb.em < CACHE_MS) ? _cacheHealthDb.resp : null;
  const doCache = !!resp;

  if (!resp) {
    const { supabase } = require('./utils/supabase');
    resp = respostaSaude(await sondar(supabase));
    _cacheHealthDb = { em: agora, resp };
    if (resp.status !== 200) console.error('[HEALTH/DB] banco nao respondeu:', resp.corpo.erro);
  }

  setSystemJobOutcome(res, {
    status: resp.status === 200 ? 'success' : 'failed',
    effectStatus: 'confirmed',
    outputCount: resp.status === 200 ? 1 : 0,
    result: resp.status === 200 ? 'db_healthy' : 'db_down',
  });


  if (resp.retryApos) res.set('Retry-After', String(resp.retryApos));
  return res.status(resp.status).json({ ...resp.corpo, cache: doCache, timestamp: new Date().toISOString() });
});


app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Endpoint de API não encontrado',
    path: req.originalUrl,
    method: req.method,
    request_id: req.requestId,
  });
});


if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}


app.use(sentryErrorHandler());




app.use(createErrorHandler());

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`[CBRio PMO] Servidor rodando na porta ${PORT}`);
    console.log(`[CBRio PMO] Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
