import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';
import {
  FERRAMENTA_FORMULARIO,
  FERRAMENTA_TELA,
  FORMULARIOS,
  TELAS,
  decidirAcao,
  idDaChamada,
  type ContextoAcao,
} from '@/lib/acoesAssistente';

const RAIZ = join(__dirname, '..', '..');



function ctx(extra: Partial<ContextoAcao> = {}): ContextoAcao {
  return {
    podeVer: (item) => item.module !== 'financeiro-bloqueado' && item.perm !== 'canFinanceiro',
    podeEscrever: () => true,
    permissoesCarregadas: true,
    telaPequena: false,
    ...extra,
  };
}

const tela = (id: string) => ({ name: FERRAMENTA_TELA, arguments: JSON.stringify({ tela: id }), tool_call_id: 'c1' });
const formulario = (id: string) => ({ name: FERRAMENTA_FORMULARIO, arguments: JSON.stringify({ formulario: id }), tool_call_id: 'c2' });

describe('ações do assistente · lista fechada e permissão', () => {
  it('ferramenta que não é nossa (Magic Canvas, internas) é ignorada sem resposta', () => {
    expect(decidirAcao({ name: 'magic_canvas_card', arguments: '{}' }, ctx())).toBeNull();
    expect(decidirAcao({ name: undefined, arguments: '{}' }, ctx())).toBeNull();
  });

  it('navega para uma tela da lista que a pessoa pode abrir', () => {
    const r = decidirAcao(tela('solicitacoes'), ctx());
    expect(r).toMatchObject({ status: 'success', navegarPara: '/solicitacoes', aviso: 'Assistente abriu: Solicitações' });
  });

  it('⚠️ sem permissão para a tela: recusa com erro e NÃO navega', () => {
    const r = decidirAcao(tela('financeiro'), ctx());
    expect(r?.status).toBe('error');
    expect(r?.navegarPara).toBeUndefined();
    expect(r?.output).toMatch(/não tem acesso à tela Financeiro/);
  });

  it('⚠️ enquanto as permissões carregam, nada é executado', () => {
    const r = decidirAcao(tela('solicitacoes'), ctx({ permissoesCarregadas: false }));
    expect(r?.status).toBe('error');
    expect(r?.navegarPara).toBeUndefined();
  });

  it('⚠️ valor fora da lista, caminho livre ou URL nunca viram navegação', () => {
    for (const valor of ['/admin/permissoes', 'https://exemplo.com', 'sistema', '../../', '']) {
      const r = decidirAcao({ name: FERRAMENTA_TELA, arguments: JSON.stringify({ tela: valor }), tool_call_id: 'x' }, ctx());
      expect(r?.status).toBe('error');
      expect(r?.navegarPara).toBeUndefined();
    }
  });

  it('⚠️ argumento que não é JSON de objeto é recusado', () => {
    for (const args of ['nada', '[]', 'null', '"tela"', 42, null, 'x'.repeat(3000)]) {
      const r = decidirAcao({ name: FERRAMENTA_TELA, arguments: args as unknown, tool_call_id: 'x' }, ctx());
      expect(r?.status).toBe('error');
    }
  });

  it('chave extra que a Tavus injeta (response_to_user) é tolerada e ignorada', () => {
    const r = decidirAcao({ name: FERRAMENTA_TELA, arguments: JSON.stringify({ tela: 'grupos', response_to_user: 'Um instante' }), tool_call_id: 'x' }, ctx());
    expect(r).toMatchObject({ status: 'success', navegarPara: '/grupos' });
  });

  it('abre o formulário de novo voluntário VAZIO na tela de Voluntários', () => {
    const r = decidirAcao(formulario('novo_voluntario'), ctx());
    expect(r?.status).toBe('success');
    expect(r?.navegarPara).toBe('/ministerial/voluntariado/lista?novo=1&assistente=1');
    expect(r?.output).toMatch(/DIGITAR os dados/);
    expect(r?.output).toMatch(/não peça nem repita nenhum dado pessoal/);
  });

  it('⚠️ formulário sem permissão de escrita (a mesma que o backend cobra) é recusado', () => {
    const chamadas: Array<[string, number]> = [];
    const r = decidirAcao(formulario('novo_voluntario'), ctx({ podeEscrever: (m, n) => { chamadas.push([m, n]); return false; } }));
    expect(r?.status).toBe('error');
    expect(r?.navegarPara).toBeUndefined();
    expect(chamadas).toEqual([['membresia', 1]]);
  });

  it('⚠️ com formulário do assistente já preenchido, não troca de tela nem abre outro (perderia o digitado)', () => {
    for (const chamada of [tela('grupos'), formulario('novo_voluntario')]) {
      const r = decidirAcao(chamada, ctx({ formularioEmPreenchimento: true }));
      expect(r?.status).toBe('error');
      expect(r?.navegarPara).toBeUndefined();
    }
  });

  it('⚠️ no celular o vídeo cobre a tela: o formulário não abre', () => {
    const r = decidirAcao(formulario('novo_voluntario'), ctx({ telaPequena: true }));
    expect(r?.status).toBe('error');
    expect(r?.navegarPara).toBeUndefined();
  });

  it('o resultado devolvido à Tavus é texto curto escrito pelo ERP', () => {
    for (const t of TELAS) {
      const r = decidirAcao({ name: FERRAMENTA_TELA, arguments: JSON.stringify({ tela: t.id }), tool_call_id: 'x' }, ctx({ podeVer: () => true }));
      expect(r?.output.length).toBeLessThan(300);
    }
  });

  it('só responde chamada com tool_call_id', () => {
    expect(idDaChamada({ tool_call_id: 'abc' })).toBe('abc');
    expect(idDaChamada({ tool_call_id: '' })).toBeNull();
    expect(idDaChamada({ tool_call_id: 7 })).toBeNull();
    expect(idDaChamada({})).toBeNull();
  });
});

describe('ações do assistente · catálogo sem deriva', () => {
  const shell = semComentariosJs(readFileSync(join(RAIZ, 'src/components/layout/AppShell.jsx'), 'utf8'));

  it('ids únicos e sem tela de administração do sistema', () => {
    const ids = TELAS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const proibida of ['/sistema', '/admin/permissoes', '/assistente-ia', '/totem']) {
      expect(TELAS.some((t) => t.caminho === proibida)).toBe(false);
    }
  });

  it('cada tela do menu existe no NAV_ITEMS com o mesmo rótulo, caminho e porteiro', () => {
    for (const t of TELAS.filter((x) => !x.foraDoMenu && !['/dashboard', '/perfil', '/notificacoes'].includes(x.caminho))) {
      const porteiro = t.perm ? `, perm: '${t.perm}'` : t.module ? `, module: '${t.module}'` : '';
      const re = new RegExp(`label: '${t.rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[^\\n]*path: '${t.caminho}'${porteiro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      expect(shell, `${t.id} divergiu do menu`).toMatch(re);
    }
  });

  it('a tela de Voluntários existe como rota do voluntariado', () => {
    const rotas = semComentariosJs(readFileSync(join(RAIZ, 'src/pages/ministerial/voluntariado/index.tsx'), 'utf8'));
    expect(rotas).toMatch(/<Route path="lista" element={<VolLista \/>} \/>/);
  });

  it('todo formulário aponta para uma tela do catálogo', () => {
    for (const f of FORMULARIOS) expect(TELAS.some((t) => t.id === f.tela)).toBe(true);
  });

  it('a lista de Voluntários abre o formulário pelo ?novo=1 e limpa o parâmetro', () => {
    const lista = semComentariosJs(readFileSync(join(RAIZ, 'src/pages/ministerial/voluntariado/VolLista.tsx'), 'utf8'));
    expect(lista).toMatch(/params\.get\('novo'\) !== '1'/);
    expect(lista).toMatch(/proximos\.delete\('novo'\)/);
    expect(lista).toMatch(/setParams\(proximos, \{ replace: true \}\)/);
    expect(lista).toMatch(/modal=\{!abertoPeloAssistente\}/);
  });

  it('salvar pelo formulário do assistente volta a lista ao normal, e o preenchimento é publicado', () => {
    const lista = semComentariosJs(readFileSync(join(RAIZ, 'src/pages/ministerial/voluntariado/VolLista.tsx'), 'utf8'));
    expect(lista).toMatch(/toast\.success\('Voluntário adicionado com sucesso'\);\s*setShowAdd\(false\);\s*setAbertoPeloAssistente\(false\);/);
    expect(lista).toMatch(/marcarFormularioEmPreenchimento\(showAdd && abertoPeloAssistente && algoDigitado\)/);
    expect(lista).toMatch(/return \(\) => marcarFormularioEmPreenchimento\(false\)/);
  });
});
