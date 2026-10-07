













import { describe, it, expect } from 'vitest';
import * as back from '../../backend/utils/inscricaoMenor.js';
import * as front from '../lib/inscricaoMenor.js';

const LADOS: Array<[string, any]> = [['backend', back], ['front', front]];
function nosDoisLados(fn: (m: any, nome: string) => void) {
  for (const [nome, mod] of LADOS) fn(mod, nome);
}

describe('idadeEmAnos · anos COMPLETOS', () => {
  it('conta o aniversário no dia, não no mês', () => {
    nosDoisLados((m, lado) => {
      expect(m.idadeEmAnos('2008-08-17', '2026-08-16'), lado).toBe(17);
      expect(m.idadeEmAnos('2008-08-17', '2026-08-17'), lado).toBe(18);
      expect(m.idadeEmAnos('2008-08-17', '2026-08-18'), lado).toBe(18);
    });
  });

  it('29/02 faz aniversário em 01/03 nos anos não bissextos', () => {
    nosDoisLados((m, lado) => {
      expect(m.idadeEmAnos('2008-02-29', '2026-02-28'), lado).toBe(17);
      expect(m.idadeEmAnos('2008-02-29', '2026-03-01'), lado).toBe(18);
    });
  });

  it('devolve null pra data ilegível ou no futuro', () => {
    nosDoisLados((m, lado) => {
      expect(m.idadeEmAnos('', '2026-08-17'), lado).toBe(null);
      expect(m.idadeEmAnos('17/08/2008', '2026-08-17'), lado).toBe(null);
      expect(m.idadeEmAnos('2027-01-01', '2026-08-17'), lado).toBe(null);
    });
  });
});

describe('hojeBRT · o dia é o do RIO', () => {
  it('01:00 UTC ainda é o dia ANTERIOR no Rio', () => {



    nosDoisLados((m, lado) => {
      expect(m.hojeBRT(Date.parse('2026-08-18T01:00:00Z')), lado).toBe('2026-08-17');
      expect(m.hojeBRT(Date.parse('2026-08-18T03:00:00Z')), lado).toBe('2026-08-18');
    });
  });

  it('o "hoje" é INJETÁVEL — o teste não depende do relógio da máquina', () => {
    nosDoisLados((m, lado) => {
      expect(typeof m.hojeBRT(), lado).toBe('string');
      expect(m.hojeBRT(Date.parse('2027-02-16T12:00:00Z')), lado).toBe('2027-02-16');
    });
  });
});

describe('ehMenorDeIdade', () => {
  it('menos de 18 é menor; 18 exatos não é', () => {
    nosDoisLados((m, lado) => {
      expect(m.ehMenorDeIdade('2009-03-01', '2026-08-17'), lado).toBe(true);
      expect(m.ehMenorDeIdade('2008-08-18', '2026-08-17'), lado).toBe(true);
      expect(m.ehMenorDeIdade('2008-08-17', '2026-08-17'), lado).toBe(false);
      expect(m.ehMenorDeIdade('1990-01-01', '2026-08-17'), lado).toBe(false);
    });
  });

  it('nascimento ilegível NÃO é tratado como menor', () => {



    nosDoisLados((m, lado) => {
      expect(m.ehMenorDeIdade('', '2026-08-17'), lado).toBe(false);
      expect(m.ehMenorDeIdade(null as any, '2026-08-17'), lado).toBe(false);
    });
  });
});

describe('exigeResponsavel · evento + pessoa', () => {
  it('precisa das DUAS coisas', () => {
    nosDoisLados((m, lado) => {
      const pede = { exige_dados_menor: true };
      const naoPede = { exige_dados_menor: false };
      expect(m.exigeResponsavel(pede, '2010-01-01', '2026-08-17'), lado).toBe(true);
      expect(m.exigeResponsavel(pede, '1990-01-01', '2026-08-17'), lado).toBe(false);
      expect(m.exigeResponsavel(naoPede, '2010-01-01', '2026-08-17'), lado).toBe(false);
      expect(m.exigeResponsavel(null, '2010-01-01', '2026-08-17'), lado).toBe(false);
    });
  });

  it('evento SEM a coluna (migration não aplicada) não pede nada', () => {


    nosDoisLados((m, lado) => {
      expect(m.exigeResponsavel({}, '2010-01-01', '2026-08-17'), lado).toBe(false);
    });
  });

  it('o corte é o do RETIRO: quem faz 18 ANTES da viagem ainda preenche', () => {



    nosDoisLados((m, lado) => {
      expect(m.exigeResponsavel({ exige_dados_menor: true }, '2009-01-10', '2026-08-17'), lado).toBe(true);
    });
  });
});


const BASE = {
  responsavel_nome: 'Ana Paula Souza',
  responsavel_cpf: '111.444.777-35',
  responsavel_parentesco: 'Mãe',
  responsavel_telefone: '(21) 99999-8888',
  responsavel_email: 'ANA@Exemplo.com',
};

describe('validarResponsavel', () => {
  it('aceita o bloco completo e NORMALIZA', () => {
    const { erros, valores } = back.validarResponsavel(BASE);
    expect(erros).toEqual({});
    expect(valores.responsavelCpf).toBe('11144477735');
    expect(valores.responsavelTelefone).toBe('21999998888');
    expect(valores.responsavelEmail).toBe('ana@exemplo.com');
  });

  it('exige DV do CPF do responsável', () => {


    expect(back.validarResponsavel({ ...BASE, responsavel_cpf: '12345678900' }).erros)
      .toHaveProperty('responsavel_cpf');
    expect(back.validarResponsavel({ ...BASE, responsavel_cpf: '11111111111' }).erros)
      .toHaveProperty('responsavel_cpf');
  });

  it('recusa nome abreviado do responsável', () => {
    expect(back.validarResponsavel({ ...BASE, responsavel_nome: 'Ana P. Souza' }).erros)
      .toHaveProperty('responsavel_nome');
    expect(back.validarResponsavel({ ...BASE, responsavel_nome: 'Ana' }).erros)
      .toHaveProperty('responsavel_nome');
  });

  it('tira o 55 do telefone só quando sobra telefone completo', () => {

    expect(back.validarResponsavel({ ...BASE, responsavel_telefone: '5521999998888' }).valores.responsavelTelefone)
      .toBe('21999998888');
    expect(back.validarResponsavel({ ...BASE, responsavel_telefone: '55999998888' }).valores.responsavelTelefone)
      .toBe('55999998888');
  });

  it('todos os campos em falta viram erro NOMEADO (a tela aponta o input)', () => {
    const { erros } = back.validarResponsavel({});
    expect(Object.keys(erros).sort()).toEqual([
      'responsavel_cpf', 'responsavel_email', 'responsavel_nome',
      'responsavel_parentesco', 'responsavel_telefone',
    ]);
  });

  it('autorização de batismo é TRI-ESTADO e nunca chuta', () => {


    expect(back.validarResponsavel(BASE).valores.responsavelAutorizaBatismo).toBe(null);
    expect(back.validarResponsavel({ ...BASE, responsavel_autoriza_batismo: 'Sim' }).valores.responsavelAutorizaBatismo).toBe(true);
    expect(back.validarResponsavel({ ...BASE, responsavel_autoriza_batismo: 'Não' }).valores.responsavelAutorizaBatismo).toBe(false);
    expect(back.validarResponsavel({ ...BASE, responsavel_autoriza_batismo: true }).valores.responsavelAutorizaBatismo).toBe(true);
    expect(back.validarResponsavel({ ...BASE, responsavel_autoriza_batismo: false }).valores.responsavelAutorizaBatismo).toBe(false);

    expect(back.validarResponsavel({ ...BASE, responsavel_autoriza_batismo: 'talvez' }).erros)
      .toHaveProperty('responsavel_autoriza_batismo');
  });

  it('e-mail inválido é recusado', () => {
    expect(back.validarResponsavel({ ...BASE, responsavel_email: 'ana@' }).erros)
      .toHaveProperty('responsavel_email');
  });
});

describe('catálogo de parentesco', () => {
  it('tem escape "Outro" — a lista não pode excluir arranjo familiar real', () => {
    nosDoisLados((m, lado) => {
      expect(m.PARENTESCOS, lado).toContain('Outro');
      expect(m.PARENTESCOS, lado).toContain('Mãe');
      expect(m.PARENTESCOS, lado).toContain('Responsável legal');
    });
  });

  it('backend e front oferecem a MESMA lista', () => {
    expect(front.PARENTESCOS).toEqual(back.PARENTESCOS);
    expect(front.MAIORIDADE).toEqual(back.MAIORIDADE);
  });
});
