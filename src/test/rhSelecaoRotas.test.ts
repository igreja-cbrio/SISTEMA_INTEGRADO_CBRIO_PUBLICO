import { resolve } from 'node:path';
import { describe,it,expect,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const requireLocal=createRequire(import.meta.url);
const fonte=readFileSync(resolve(__dirname, '../../backend/routes/rhSelecao.js'),'utf8');
const regras=requireLocal('../../backend/utils/rhSelecao.js');
function carregar(resultados:any[]=[]) {
  const rotas=new Map<string,any[]>(), consultas:any[]=[];
  const router:any={use:vi.fn(),param:vi.fn()};for(const m of ['get','post','put','patch'])router[m]=(path:string,...h:any[])=>rotas.set(`${m} ${path}`,h);
  const sb={from:(table:string)=>{const filtros:any[]=[];consultas.push({table,filtros});const b:any={};for(const m of ['select','eq','is','ilike','in','order','range','contains','maybeSingle','single','insert','update'])b[m]=(...a:any[])=>{filtros.push([m,...a]);return b;};b.then=(ok:any)=>Promise.resolve(resultados.shift() || {}).then(ok);return b;}};
  const auth={authenticate:vi.fn(),apenasColaborador:vi.fn(),authorizeModule:vi.fn(()=> 'GESTAO_RH4')};
  const multer:any=()=>({single:()=>vi.fn()});multer.memoryStorage=()=>({});
  const modulo={exports:{}};runInNewContext(fonte,{module:modulo,Buffer,console,require:(id:string)=>{
    if(id==='express')return{Router:()=>router};if(id==='multer')return multer;if(id==='crypto')return requireLocal('crypto');if(id==='express-rate-limit')return()=> 'LIMITADOR_IA';
    if(id==='../middleware/auth')return auth;if(id==='../utils/supabase')return{supabase:sb};if(id==='../utils/rhSelecao')return regras;if(id==='../utils/rhSelecaoFormulario')return requireLocal('../../backend/utils/rhSelecaoFormulario.js');if(id==='../services/notificar')return{notificar:vi.fn()};if(id==='../services/rhSelecaoIA')return{};throw new Error(id);
  }});
  const res:any={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis()};return{rotas,consultas,auth,router,res};
}
describe('Portas de seleção interna',()=>{
  it('exige autenticação e bloqueia contas só de membro',()=>{const t=carregar();expect(t.router.use).toHaveBeenCalledWith(t.auth.authenticate,t.auth.apenasColaborador);expect(t.auth.authorizeModule).toHaveBeenCalledWith('rh',4);});
  it('toda rota administrativa inclusive anexo e IA usa guardRH4',()=>{const t=carregar();for(const[k,h]of t.rotas)if(k.includes('/gestao')||k.includes('/inscricoes/:id'))expect(h[0],k).toBe('GESTAO_RH4');});
  it('inscrição não exige gestãoRH mas exige vínculo ativo literal',async()=>{
    const t=carregar([{data:[{id:'f',email:'anaXsilva@example.org'}]}]);const next=vi.fn();await t.rotas.get('get /:id')![0]({user:{email:'ana_silva@example.org'}},t.res,next);expect(t.res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();expect(t.consultas[0].filtros).toContainEqual(['in','status',['ativo','ferias','licenca']]);
  });
  it('bloqueia identidade ambígua e diferencia falha de banco',async()=>{
    const t=carregar([{data:[{email:'a@example.org'},{email:'a@example.org'}]},{error:{message:'offline'}}]);const fn=t.rotas.get('get /:id')![0];await fn({user:{email:'a@example.org'}},t.res,vi.fn());expect(t.res.status).toHaveBeenCalledWith(409);await fn({user:{email:'a@example.org'}},t.res,vi.fn());expect(t.res.status).toHaveBeenCalledWith(503);
  });
  it('consulta inscrição somente do profile autenticado',async()=>{
    const t=carregar([{data:{id:'p',status:'aberto',vagas:['Design']}},{data:null}]);await t.rotas.get('get /:id')!.at(-1)({params:{id:'p'},user:{userId:'eu'},funcionario:{nome:'Eu'}},t.res);expect(t.consultas[1].filtros).toContainEqual(['eq','profile_id','eu']);
  });
  it('recusa envio quando processo fechou com formulário aberto',async()=>{
    const t=carregar([{data:{id:'p',status:'encerrado'}}]);await t.rotas.get('post /:id/inscricoes')!.at(-1)({params:{id:'p'}},t.res);expect(t.res.status).toHaveBeenCalledWith(409);expect(t.consultas).toHaveLength(1);
  });
  it('recusa envio de uma versão antiga sem gravar inscrição',async()=>{
    const t=carregar([{data:{id:'p',status:'aberto',vagas:['Design'],formulario_versao:2}}]);
    await t.rotas.get('post /:id/inscricoes')!.at(-1)({params:{id:'p'},body:{dados:JSON.stringify({formulario_versao:1})}},t.res);
    expect(t.res.status).toHaveBeenCalledWith(409);expect(t.consultas).toHaveLength(1);
  });
  it('edita nome e formulário com controle de versão, sem alterar status nem vagas',async()=>{
    const t=carregar([{data:{id:'p',formulario_versao:2}},{data:{id:'p',titulo:'Novo nome',formulario_versao:3}}]);
    await t.rotas.get('put /gestao/:id/formulario')!.at(-1)({params:{id:'p'},body:{titulo:'Novo nome',versao:2,formulario:{descricao:'',campos:[]},status:'aberto',vagas:['Injetada']}},t.res);
    expect(t.consultas[1].filtros).toContainEqual(['eq','formulario_versao',2]);
    const update=t.consultas[1].filtros.find((f:any[])=>f[0]==='update')[1];
    expect(Object.keys(update).sort()).toEqual(['formulario','titulo']);expect(t.res.json).toHaveBeenCalledWith(expect.objectContaining({formulario_versao:3}));
  });
  it('avisa conflito de edição sem sobrescrever outra versão',async()=>{
    const t=carregar([{data:{id:'p'}},{data:null}]);
    await t.rotas.get('put /gestao/:id/formulario')!.at(-1)({params:{id:'p'},body:{titulo:'Novo nome',versao:1,formulario:{descricao:'',campos:[]}}},t.res);
    expect(t.res.status).toHaveBeenCalledWith(409);
  });

});
