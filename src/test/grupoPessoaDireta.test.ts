import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { funcaoDoRoster } from '../../backend/utils/pessoaDiretaCampos.js';




















describe('⚠️ função no grupo: whitelist FECHADA, não o que vier no corpo', () => {
  it('o default é frequentador — adicionar de propósito é PARTICIPAÇÃO', () => {


    expect(funcaoDoRoster({})).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: '' })).toBe('frequentador');
    expect(funcaoDoRoster()).toBe('frequentador');
  });

  it('visitante quando quem preenche DECLARA', () => {


    expect(funcaoDoRoster({ funcao: 'visitante' })).toBe('visitante');
  });

  it('⚠️⚠️ liderança NÃO passa por esta porta — é AUTORIZAÇÃO, não rótulo', () => {



    expect(funcaoDoRoster({ funcao: 'lider' })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: 'lider_treinamento' })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: 'co_lider' })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: 'supervisor' })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: 'coordenador' })).toBe('frequentador');
  });

  it('valor inventado cai no default, nunca vai cru pro banco', () => {


    expect(funcaoDoRoster({ funcao: 'chefe' })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: 42 as unknown as string })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: null as unknown as string })).toBe('frequentador');
  });
});







const SERVICO = (() => {
  const bruto = readFileSync(
    resolve(process.cwd(), 'backend/services/grupoPessoaDireta.js'), 'utf8',
  );
  return bruto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map(l => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n');
})();

describe('⚠️⚠️ a porta usa o CONTRATO, não uma validação própria', () => {
  it('chama validarCamposPadrao', () => {
    expect(SERVICO).toMatch(/validarCamposPadrao\(/);
  });

  it('⚠️ exige os 4 campos que o formulário público de grupos exige', () => {



    expect(SERVICO).toMatch(/exigirCpf:\s*true/);
    expect(SERVICO).toMatch(/exigirEmail:\s*true/);
    expect(SERVICO).toMatch(/exigirNascimento:\s*true/);
    expect(SERVICO).toMatch(/exigirSexo:\s*true/);
  });

  it('resolve identidade pelo funil canônico, nunca por insert direto em mem_membros', () => {


    expect(SERVICO).toMatch(/processarIdentidade\(/);
    expect(SERVICO).not.toMatch(/from\('mem_membros'\)\s*\.insert/);
  });

  it('⚠️ enriquece o cadastro existente SÓ ONDE VAZIO', () => {


    expect(SERVICO).toMatch(/!mem\.genero/);
    expect(SERVICO).toMatch(/!mem\.data_nascimento/);
    expect(SERVICO).toMatch(/!mem\.email/);
  });

  it('⚠️ contato divergente ACUMULA em mem_contatos, não sobrescreve o principal', () => {


    expect(SERVICO).toMatch(/registrarContatoDaPorta\(/);
  });

  it('⚠️⚠️ o opt-in de WhatsApp SÓ LIGA, nunca desliga', () => {




    expect(SERVICO).toMatch(/whatsapp_optin\.is\.null,whatsapp_optin\.eq\.false/);
    expect(SERVICO).not.toMatch(/whatsapp_optin:\s*false/);
  });

  it('⚠️⚠️ o consentimento é gravado como DECLARAÇÃO DE TERCEIRO', () => {



    expect(SERVICO).toMatch(/DECLARADO PRESENCIALMENTE POR/);
    expect(SERVICO).toMatch(/não é aceite digitado pelo próprio titular/);


    expect(SERVICO).toMatch(/TEXTOS\.termos_lgpd/);
  });

  it('⚠️ registra o item de WhatsApp mesmo quando a pessoa disse NÃO', () => {

    expect(SERVICO).toMatch(/tipo:\s*'whatsapp',\s*aceito:\s*optin/);
  });

  it('⚠️ NÃO manda WhatsApp nem cria pedido — foi o pedido explícito', () => {

    expect(SERVICO).not.toMatch(/notificarLiderNovoPedido|gruposWpp|sendTemplate/);
    expect(SERVICO).not.toMatch(/from\('mem_grupo_pedidos'\)\s*\.insert/);
    expect(SERVICO).not.toMatch(/aprovarPedidoCore/);
  });

  it('⚠️ o vínculo é idempotente: dois toques não criam dois', () => {
    expect(SERVICO).toMatch(/ja_no_grupo/);
  });
});
