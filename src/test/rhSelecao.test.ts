import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { caminhoSelecao, guardarRetornoSelecao, lerRetornoSelecao } from '../lib/selecaoRetorno';
const requireLocal = createRequire(import.meta.url);
const regras = requireLocal('../../backend/utils/rhSelecao.js');
const crypto = requireLocal('node:crypto');
const codigoIA = readFileSync(resolve(__dirname, '../../backend/services/rhSelecaoIA.js'),'utf8');
function carregarIA(resultado?: any) {
  const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(resultado) }] });
  const modulo = { exports: {} as any };
  runInNewContext(codigoIA,{ module: modulo, Buffer, URL, require: (id: string) => {
    if(id==='crypto') return crypto;
    if(id==='zlib') return requireLocal('zlib');
    if(id==='@anthropic-ai/sdk') return class { messages = { create }; };
    if(id==='../utils/supabase') return { supabase: {} };
    if(id==='../utils/rhSelecao') return regras;
    throw new Error(id);
  }});
  return { ia: modulo.exports, create };
}
const body = { nome:'Pessoa Teste',cargo_area:'Equipe · Operações',vagas:['Design'],motivacao:'Tenho experiência',experiencia:'Coordenei a entrega',consentimento:true };
describe('Seleção interna — validação da inscrição',() => {
  it('mantém múltiplas vagas e remove duplicatas sem aceitar outras vagas',()=>{
    expect(regras.validarInscricao({...body,vagas:['Design','Financeiro','Design']},{vagas:['Design','Financeiro']}).vagas).toEqual(['Design','Financeiro']);
    expect(()=>regras.validarInscricao({...body,vagas:['Admin']},{vagas:['Design']})).toThrow('vaga válida');
  });
  it.each(['nome','cargo_area','motivacao','experiencia'])('rejeita campo obrigatório vazio: %s',campo=>expect(()=>regras.validarInscricao({...body,[campo]:'  '},{vagas:['Design']})).toThrow());
  it('consentimento precisa ser booleano verdadeiro',()=>expect(()=>regras.validarInscricao({...body,consentimento:'true'},{vagas:['Design']})).toThrow('Autorize'));
  it.each(['javascript:alert(1)','data:text/html,a','https://user:senha@example.com'])('bloqueia link perigoso %s',v=>expect(()=>regras.linkSeguro(v)).toThrow());
  it('valida assinatura dos anexos',()=>{
    expect(regras.extensaoArquivo({mimetype:'application/pdf',buffer:Buffer.from('%PDF-1.7')})).toBe('pdf');
    expect(()=>regras.extensaoArquivo({mimetype:'application/pdf',buffer:Buffer.from('<script>')})).toThrow();
  });
});
describe('IA — critérios, evidências e material revisado',()=>{
  it('rejeita critérios sensíveis e limita quantidade',()=>{
    const {ia}=carregarIA(); expect(()=>ia.criteriosValidos('Prefiro uma pessoa jovem')).toThrow('profissionais');
    expect(()=>ia.criteriosValidos(Array(13).fill('Experiência em design').join('\n'))).toThrow('12');
  });
  it('calcula aderência no servidor e exige trechos existentes',()=>{
    const {ia}=carregarIA();
    const r={itens:[{status:'evidenciado',evidencia:'coordenei equipes'},{status:'parcial',evidencia:'usei Excel'}],pontuacao:100};
    expect(ia.validarResultado(r,['Liderança','Planilhas'],'coordenei equipes e usei Excel').pontuacao).toBe(75);
    expect(()=>ia.validarResultado(r,['Liderança','Planilhas'],'não há esses trechos')).toThrow('evidência');
  });
  it('não evidenciado não inventa evidência nem significa reprovação',()=>{
    const {ia}=carregarIA();expect(ia.validarResultado({itens:[{status:'nao_evidenciado',evidencia:''}]},['Excel'],'Texto').pontuacao).toBe(0);
  });
  it('recusa iniciar chamada sem material revisado',async()=>{
    const {ia,create}=carregarIA();await expect(ia.analisar({motivacao:'Dados pessoais'},'Design','Experiência com design')).rejects.toThrow('material profissional');expect(create).not.toHaveBeenCalled();
  });
  it('envia somente material revisado e critérios, nunca respostas brutas',async()=>{
    const {ia,create}=carregarIA({itens:[{status:'evidenciado',evidencia:'Produzi campanhas'}]});
    await ia.analisar({nome:'SEGREDO_NOME',motivacao:'SEGREDO_BRUTO',anexo_path:'SEGREDO_PATH',material_ia:'Produzi campanhas'},'Design','Experiência com campanhas');
    const pedido=JSON.stringify(create.mock.calls[0][0]);expect(pedido).toContain('Produzi campanhas');expect(pedido).not.toContain('SEGREDO');
  });
  it('mudança no material invalida o hash e mudança nos critérios também',()=>{
    const {ia}=carregarIA();expect(ia.hashFontes({material_ia:'A'})).not.toBe(ia.hashFontes({material_ia:'B'}));expect(ia.hashCriterios('A')).not.toBe(ia.hashCriterios('B'));
  });
  it('rejeita ZIP de expansão excessiva antes do parser',()=>{
    const {ia}=carregarIA();const b=Buffer.alloc(50);b.writeUInt32LE(0x02014b50,0);b.writeUInt32LE(20*1024*1024,24);expect(()=>ia.validarZip(b)).toThrow('descompactar');
  });
});
describe('Retorno de login',()=>{
  it('aceita apenas o formulário interno com UUID, sem host/query',()=>{
    const p='/selecao-interna/11111111-1111-4111-8111-111111111111';expect(caminhoSelecao(p)).toBe(p);
    for(const v of ['//evil.com','https://evil.com',p+'?redirect=evil','/admin/rh','/selecao-interna/../admin']) expect(caminhoSelecao(v)).toBeNull();
  });
  it('retorno expira após 30 minutos',()=>{
    const itens=new Map();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>itens.get(k),setItem:(k:string,v:string)=>itens.set(k,v)});
    const agora=Date.now(); const spy=vi.spyOn(Date,'now').mockReturnValue(agora);
    guardarRetornoSelecao('/selecao-interna/11111111-1111-4111-8111-111111111111');expect(lerRetornoSelecao()).toBeTruthy();spy.mockReturnValue(agora+1800001);expect(lerRetornoSelecao()).toBeNull();spy.mockRestore();vi.unstubAllGlobals();
  });
});
