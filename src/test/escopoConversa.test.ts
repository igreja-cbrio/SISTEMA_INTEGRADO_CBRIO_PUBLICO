// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const { podeVerConversa, criarEscopoConversa } = require('../../backend/middleware/escopoConversa');
const user = { id: 'u', role: 'colaborador', granular: { areas: ['Kids'] } };
const conversa = { area: 'Kids', atribuido_a: null, deleted_at: null };
describe('escopo da conversa individual', () => {
 it('permite Entrada, área própria, atribuição ou administrador', () => {
  for (const c of [conversa, { ...conversa, area: null }, { ...conversa, area: 'Outra', atribuido_a: 'u' }]) expect(podeVerConversa(user,c)).toBe(true);
  expect(podeVerConversa({...user,role:'admin'},{...conversa,area:'Outra'})).toBe(true);
 });
 it('nega outro setor, anônimo, excluído e área ausente', () => {
  expect(podeVerConversa(user,{...conversa,area:'Outra'})).toBe(false);
  expect(podeVerConversa(null,conversa)).toBe(false);
  expect(podeVerConversa(user,{...conversa,deleted_at:'2026-10-06'})).toBe(false);
  expect(podeVerConversa(user,{...conversa,area:undefined})).toBe(false);
 });
 it('espelha userId e não aceita user_metadata como permissão', () => {
  expect(podeVerConversa({userId:'u',granular:{areas:[]}},{area:'Outra',atribuido_a:'u'})).toBe(true);
  expect(podeVerConversa({id:'u',user_metadata:{role:'admin'}},{area:'Outra'})).toBe(false);
 });
 it('falha fechada no middleware antes do handler e distingue erro operacional', async () => {
  for(const [data,error,status] of [[{...conversa,area:'Outra'},null,404],[null,new Error('offline'),503],[null,null,404]] as const){
   const q:any={select:vi.fn(()=>q),eq:vi.fn(()=>q),is:vi.fn(()=>q),maybeSingle:vi.fn(async()=>({data,error}))};
   const db={from:vi.fn(()=>q)},res:any={status:vi.fn(()=>res),json:vi.fn()},next=vi.fn();
   await criarEscopoConversa(db)({params:{id:'10000000-0000-0000-0000-000000000001'},user},res,next);
   expect(res.status).toHaveBeenCalledWith(status);expect(next).not.toHaveBeenCalled();expect(q.is).toHaveBeenCalledWith('deleted_at',null);
  }
 });
 it('rejeita referência inválida sem consultar banco', async()=>{
  const db={from:vi.fn()},res:any={status:vi.fn(()=>res),json:vi.fn()};
  await criarEscopoConversa(db)({params:{id:'../x'},user},res,vi.fn());expect(db.from).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(404);
 });
 it('todas as rotas individuais validam escopo após nível e antes de upload/handler',()=>{
  const s=readFileSync('backend/routes/waInbox.js','utf8');
  const rotas=s.split('\n').filter(l=>/^router\.(get|post|patch)\('\/conversas\/:id/.test(l));
  expect(rotas.length).toBe(8);
  expect(s.match(/if \(!podeVerConversa\(req.user, conv\)\)/g)).toHaveLength(2);
  const sugestao=readFileSync('backend/routes/comunicacao.js','utf8').split('\n').find(l=>l.startsWith("router.get('/conversas/:id/sugestao-grupo'"));
  expect(sugestao).toContain("authorizeModule('conversas', 1)");
  expect(sugestao).toContain('criarEscopoConversa(supabase)');
  for(const r of rotas)expect(r).toMatch(/authorizeModule\('conversas', [12]\), escopoConversa,/);
  expect(s).toContain('if (mensagensError) throw mensagensError');
  expect(s).toContain('waInbox.mesmoNumeroBR(e.telefone, conv.telefone)');
 });
});

describe('abertura humana não vincula identidade por telefone',()=>{
 function servico(existente:any){
  const writes:any[]=[],tables:string[]=[];
  const db={from:(table:string)=>{tables.push(table);const q:any={select:()=>q,eq:()=>q,ilike:()=>q,limit:async()=>({data:[]}),maybeSingle:async()=>({data:existente}),single:async()=>({data:{id:'nova',area:null,...writes.at(-1)}}),insert:(p:any)=>{writes.push(p);return q;},update:(p:any)=>{writes.push(p);return q;}};return q;}};
  const module={exports:{} as any};runInNewContext(readFileSync('backend/services/waInbox.js','utf8'),{module,exports:module.exports,console,process:{env:{}},require:(p:string)=>p==='../utils/supabase'?{supabase:db}:p==='./whatsappService'?{normalizarTelefone:(v:string)=>v}:require(p)});
  return {api:module.exports,writes,tables};
 }
 it('recusa conversa existente antes de enriquecer ou gravar',async()=>{
  const s=servico({id:'outra',area:'Outra',nome:null,membro_id:null});
  expect(await s.api.acharOuCriarConversa('5521900000498',null,{semVinculoAutomatico:true,podeAcessar:()=>false})).toBeNull();
  expect(s.writes).toHaveLength(0);expect(s.tables).toEqual(['wa_conversas']);
 });
 it('saída humana mantém identidade vazia depois do primeiro envio',async()=>{
  const s=servico({id:'existente',area:null,nome:null,membro_id:null});
  await s.api.registrarOutbound({telefone:'5521900000498',texto:'Olá',autorId:'atendente'});
  expect(s.tables.every(t=>['wa_conversas','wa_mensagens'].includes(t))).toBe(true);
  expect(s.writes).toHaveLength(2);expect(s.writes.every(w=>!('membro_id' in w))).toBe(true);
  expect(s.writes[0]).toMatchObject({conversa_id:'existente',autor_id:'atendente',texto:'Olá'});
 });
 it('nova conversa humana cria só endereço de atendimento, sem associar membro',async()=>{
  const s=servico(null);await s.api.acharOuCriarConversa('5521900000498',null,{semVinculoAutomatico:true,podeAcessar:()=>true});
  expect(s.writes).toEqual([{telefone:'5521900000498',nome:null,membro_id:null}]);expect(s.tables.every(t=>t==='wa_conversas')).toBe(true);
 });
});
