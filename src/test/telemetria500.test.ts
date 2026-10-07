












import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { criarTelemetria500 } = req('../../backend/middleware/telemetria500.js');
const { requestContext } = req('../../backend/middleware/requestContext.js');
const { registrarFalhaDb } = req('../../backend/utils/contextoFalha.js');
const { falhaInterna } = req('../../backend/utils/responderFalha.js');

let gravados: any[] = [];

function montarApp() {
  const app = express();
  app.use(requestContext);
  app.use(criarTelemetria500({
    recordError: async (row: any) => { gravados.push(row); },
    logger: { warn: () => {} },
  }));




  app.get('/muda', (_r, res) => {
    registrarFalhaDb({
      motivo: 'column pat_bens.decisoes does not exist',
      codigo: '42703', status: 400, rota: '/rest/v1/pat_bens',
    });
    res.status(500).json({ error: 'Erro ao dar baixa em massa' });
  });


  app.get('/entrega', (_r, res) => {
    const e: any = new Error('Cannot read properties of undefined (reading notas)');
    e.code = 'TypeError';
    e.stack = 'TypeError: x\n    at Logistica (/var/task/backend/routes/logistica.js:42:7)';
    falhaInterna(res, 'Erro ao importar a nota', e);
  });


  app.get('/sem-motivo', (_r, res) => { res.status(500).json({ error: 'Erro' }); });

  app.get('/ok', (_r, res) => { res.json({ ok: true }); });
  app.get('/quatro', (_r, res) => { res.status(409).json({ error: 'conflito' }); });


  app.get('/com-pii', (_r, res) => {
    registrarFalhaDb({
      motivo: 'duplicate key value violates unique constraint "uniq_cpf" Key (cpf)=(12345678901) already exists',
      codigo: '23505', status: 409,
    });
    res.status(500).json({ error: 'Erro ao salvar' });
  });

  return app;
}

async function chamar(caminho: string) {
  const app = montarApp();
  const srv = app.listen(0);
  const porta = (srv.address() as any).port;
  try {
    await fetch(`http://127.0.0.1:${porta}${caminho}`).then((r) => r.text());

    await new Promise((r) => setTimeout(r, 30));
  } finally {
    await new Promise((r) => srv.close(r));
  }
}

beforeEach(() => { gravados = []; });

describe('telemetria500 · o motivo chega ao coletor', () => {
  it('⚠️⚠️ rota MUDA: o motivo do BANCO chega sozinho (cobre os 791 catches)', async () => {
    await chamar('/muda');
    expect(gravados).toHaveLength(1);
    expect(gravados[0].mensagem).toContain('column pat_bens.decisoes does not exist');
    expect(gravados[0].mensagem).toContain('[42703]');
    expect(gravados[0].mensagem.startsWith('HTTP 500')).toBe(true);
    expect(gravados[0].status).toBe(500);
    expect(gravados[0].request_id).toBeTruthy();
  });

  it('rota que ENTREGA o motivo grava mensagem E stack (o stack alimenta o code_context)', async () => {
    await chamar('/entrega');
    expect(gravados).toHaveLength(1);
    expect(gravados[0].mensagem).toContain('Cannot read properties of undefined');
    expect(gravados[0].stack).toContain('backend/routes/logistica.js:42');
  });

  it('⚠️ sem motivo nenhum, a mensagem é a de ANTES (byte a byte)', async () => {
    await chamar('/sem-motivo');
    expect(gravados).toHaveLength(1);
    expect(gravados[0].mensagem).toBe('HTTP 500 respondido pela rota (sem exceção · ver logs da função)');
    expect(gravados[0].stack).toBeNull();
  });

  it('⚠️⚠️ PII do banco NÃO vai pro coletor (o texto é enviado a uma IA)', async () => {
    await chamar('/com-pii');
    expect(gravados).toHaveLength(1);
    expect(gravados[0].mensagem).not.toContain('12345678901');
    expect(gravados[0].mensagem).toContain('[cpf]');

    expect(gravados[0].mensagem).toContain('uniq_cpf');
  });

  it('resposta OK e 4xx não geram registro', async () => {
    await chamar('/ok');
    await chamar('/quatro');
    expect(gravados).toHaveLength(0);
  });

  it('⚠️ o contexto NÃO vaza entre requisições (o ALS é por requisição)', async () => {
    await chamar('/muda');
    await chamar('/sem-motivo');
    expect(gravados).toHaveLength(2);
    expect(gravados[0].mensagem).toContain('does not exist');

    expect(gravados[1].mensagem).toBe('HTTP 500 respondido pela rota (sem exceção · ver logs da função)');
  });
});
