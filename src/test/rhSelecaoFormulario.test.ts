import { reconciliarRespostasSelecao } from '../lib/respostasSelecao';
import { describe,it,expect } from 'vitest';
import { createRequire } from 'node:module';
const requireLocal=createRequire(import.meta.url);
const { PADRAO,validarFormulario,validarRespostas }=requireLocal('../../backend/utils/rhSelecaoFormulario.js');
const { validarInscricao }=requireLocal('../../backend/utils/rhSelecao.js');
const corpo={nome:'Pessoa Teste',cargo_area:'Equipe',vagas:['Design'],consentimento:true};
const campo={id:'campo_teste',tipo:'curta',titulo:'Experiência profissional',ajuda:'',obrigatorio:true,opcoes:[]};
const processo=(campos:any[])=>({vagas:['Design'],formulario_versao:2,formulario:{descricao:'Teste',campos}});
describe('Formulário editável de seleção',()=>{
  it('mantém o formulário original como padrão',()=>expect(validarFormulario(PADRAO).campos).toHaveLength(4));
  it('permite remover perguntas sem falsificar respostas legadas',()=>{
    const r=validarInscricao(corpo,processo([]));expect(r.motivacao).toBe('');expect(r.experiencia).toBe('');expect(r.respostas).toEqual({});expect(r.formulario_versao).toBe(2);
  });
  it('valida obrigatoriedade no servidor e permite mudar para opcional',()=>{
    expect(()=>validarRespostas(corpo,processo([campo]),false)).toThrow();
    expect(validarRespostas(corpo,processo([{...campo,obrigatorio:false}]),false)).toEqual({campo_teste:''});
  });
  it('não permite sobrescrever campos de identidade com perguntas novas',()=>expect(()=>validarFormulario({campos:[{...campo,id:'profile_id'}]})).toThrow());
  it('rejeita IDs repetidos, tipos desconhecidos e excesso de perguntas',()=>{
    expect(()=>validarFormulario({campos:[campo,campo]})).toThrow();
    expect(()=>validarFormulario({campos:[{...campo,tipo:'html'}]})).toThrow();
    expect(()=>validarFormulario({campos:Array(21).fill(campo)})).toThrow();
  });
  it('exige opções distintas e em quantidade válida',()=>{
    expect(()=>validarFormulario({campos:[{...campo,tipo:'escolha',opcoes:['A','A']}]})).toThrow();
    expect(()=>validarFormulario({campos:[{...campo,tipo:'escolha',opcoes:['A']}]})).toThrow();
  });
  it('valida respostas de escolha única e múltipla contra o catálogo',()=>{
    const p=processo([{...campo,tipo:'multipla',opcoes:['A','B']}]);
    expect(validarRespostas({respostas:{campo_teste:['A','A']}},p,false)).toEqual({campo_teste:['A']});
    expect(()=>validarRespostas({respostas:{campo_teste:['C']}},p,false)).toThrow();
    expect(()=>validarRespostas({respostas:{campo_teste:[]}},p,false)).toThrow();
    expect(()=>validarRespostas({respostas:{campo_teste:'C'}},processo([{...campo,tipo:'escolha',opcoes:['A','B']}]),false)).toThrow();
  });
  it('exige arquivo ou link quando anexo obrigatório e recusa anexo removido',()=>{
    const p=processo([{id:'anexo',tipo:'anexo',titulo:'Currículo',obrigatorio:true}]);
    expect(()=>validarRespostas({},p,false)).toThrow();
    expect(validarRespostas({},p,true)).toEqual({});
    expect(validarRespostas({anexo_link:'https://example.org'},p,false)).toEqual({});
    expect(()=>validarRespostas({},processo([]),true)).toThrow();
  });
  it('ignora respostas de perguntas removidas e bloqueia valores malformados',()=>{
    expect(validarRespostas({respostas:{campo_removido:'Antigo'}},processo([]),false)).toEqual({});
    expect(()=>validarRespostas({respostas:{campo_teste:{texto:'injetado'}}},processo([campo]),false)).toThrow();
  });
  it('preserva a validação de identidade e consentimento',()=>{
    expect(()=>validarInscricao({...corpo,consentimento:false},processo([]))).toThrow('Autorize');
    expect(()=>validarInscricao({...corpo,nome:''},processo([]))).toThrow();
  });
  it('reconcilia opções removidas e tipos alterados preservando o texto compatível',()=>{
    const r=reconciliarRespostasSelecao({a:['Antiga','Atual'],b:'Texto livre',c:'Removida',d:['Incompatível'],apagada:'Valor'},[
      {id:'a',tipo:'multipla',opcoes:['Atual','Nova']},{id:'b',tipo:'paragrafo'},{id:'c',tipo:'escolha',opcoes:['Nova']},{id:'d',tipo:'curta'}
    ]);
    expect(r).toEqual({a:['Atual'],b:'Texto livre',c:'',d:''});
  });

});
