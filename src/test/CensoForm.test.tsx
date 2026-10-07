import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import CensoForm from '../components/censo/CensoForm';
import PerguntaCampo from '../components/censo/PerguntaCampo';
import { limparInvisiveis } from '../lib/censoForm';
import { PublicPaletteCtx } from '../pages/public/publicTheme';
import questionario from '../../backend/data/censoQuestionario2026.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
const perguntas = questionario.perguntas as any[];

const PALETA: any = {
  isDark: true, pageBg: '#000', card: '#111', cardBorder: '#222',
  text: '#eee', text2: '#ddd', text3: '#aaa', textDim: '#777',
  inputBorder: '#333', optionBg: '#161616', shapes: false,
};


function montar(iniciais: Record<string, unknown> = {}) {
  const onEnviar = vi.fn();
  let respostas = { ...iniciais };
  let consentimento = false;
  const r = render(
    <PublicPaletteCtx.Provider value={PALETA}>
      <CensoForm
        perguntas={perguntas} respostas={respostas}
        onChange={(n) => { respostas = n; redesenhar(); }}
        onEnviar={onEnviar}
        consentimentoTexto="Aceito o aviso de privacidade."
        consentimento={consentimento}
        onConsentimento={(v) => { consentimento = v; redesenhar(); }}
      />
    </PublicPaletteCtx.Provider>,
  );
  function redesenhar() {
    r.rerender(
      <PublicPaletteCtx.Provider value={PALETA}>
        <CensoForm
          perguntas={perguntas} respostas={respostas}
          onChange={(n) => { respostas = n; redesenhar(); }}
          onEnviar={onEnviar}
          consentimentoTexto="Aceito o aviso de privacidade."
          consentimento={consentimento}
          onConsentimento={(v) => { consentimento = v; redesenhar(); }}
        />
      </PublicPaletteCtx.Provider>,
    );
  }
  return { onEnviar, get respostas() { return respostas; } };
}

describe('CensoForm · o que a pessoa vê no culto', () => {
  it('abre no primeiro bloco e não despeja as 93 perguntas de uma vez', () => {
    montar();
    expect(screen.getByText('1 — Identificação básica')).toBeTruthy();
    expect(screen.getByText(/Parte 1 de \d+/)).toBeTruthy();

    expect(screen.queryByText('Você já fez ou faz terapia?')).toBeNull();
  });

  it('NÃO avança com obrigatória em branco, e NOMEIA os campos', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText(/Confira \d+ campos? desta parte/)).toBeTruthy();


    const aviso = screen.getByText(/Confira \d+ campos? desta parte/).parentElement!;
    expect(aviso.textContent).toMatch(/CPF/);
    expect(aviso.textContent).toMatch(/Precisa responder/);
    expect(screen.getByText('1 — Identificação básica')).toBeTruthy();
  });







  it('CPF com dígito trocado NÃO avança — e diz que o CPF está inválido', () => {
    const t = montar({ cpf: '111.111.111-11' });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    const aviso = screen.getByText(/Confira \d+ campos? desta parte/).parentElement!;
    expect(aviso.textContent).toMatch(/CPF inválido/);
    expect(t.onEnviar).not.toHaveBeenCalled();
  });

  it('CPF válido deixa de ser cobrado', () => {
    montar({ cpf: '123.456.789-09' });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    const aviso = screen.getByText(/Confira \d+ campos? desta parte/).parentElement!;
    expect(aviso.textContent).not.toMatch(/CPF inválido/);
  });

  it('a condicional aparece na hora que a resposta a ativa', () => {
    montar();
    expect(screen.queryByText('Quantos filhos?')).toBeNull();

    const grupo = screen.getByText('Tem filhos?').parentElement!;
    fireEvent.click(grupo.querySelector('button')!);
    expect(screen.getByText('Quantos filhos?')).toBeTruthy();
    expect(screen.getByText('Em quais faixas de idade?')).toBeTruthy();
  });

  it('ao voltar atrás, a condicional some da tela e a resposta órfã não vai no envio', () => {
    const t = montar();
    const grupo = screen.getByText('Tem filhos?').parentElement!;
    const [sim, nao] = Array.from(grupo.querySelectorAll('button'));
    fireEvent.click(sim);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    expect(t.respostas.filhos_quantos).toBe(3);

    fireEvent.click(nao);
    expect(screen.queryByText('Quantos filhos?')).toBeNull();



    expect(limparInvisiveis(perguntas, t.respostas).filhos_quantos).toBeUndefined();
    expect(limparInvisiveis(perguntas, t.respostas).tem_filhos).toBe('Não');
  });

  it('solteiro não vê o campo de cônjuge', () => {
    montar();
    const ec = screen.getByText('Estado civil').parentElement!;
    fireEvent.click(ec.querySelectorAll('button')[0]);
    expect(screen.queryByText('Nome do cônjuge')).toBeNull();
    fireEvent.click(ec.querySelectorAll('button')[1]);
    expect(screen.getByText('Nome do cônjuge')).toBeTruthy();
  });

  it('clicar em "Prefiro não dizer" limpa as outras marcações — de verdade, na UI', () => {


    const p = perguntas.find((q) => q.id === 'restauracao_area')!;
    let valor: unknown = ['Traumas', 'Culpa'];
    const r = render(
      <PublicPaletteCtx.Provider value={PALETA}>
        <PerguntaCampo pergunta={p} valor={valor} onChange={(v) => { valor = v; }} />
      </PublicPaletteCtx.Provider>,
    );
    fireEvent.click(r.getByRole('button', { name: /Prefiro não dizer/ }));
    expect(valor).toEqual(['Prefiro não dizer']);


    r.rerender(
      <PublicPaletteCtx.Provider value={PALETA}>
        <PerguntaCampo pergunta={p} valor={valor} onChange={(v) => { valor = v; }} />
      </PublicPaletteCtx.Provider>,
    );
    fireEvent.click(r.getByRole('button', { name: /Traumas/ }));
    expect(valor).toEqual(['Traumas']);
  });

  it('escala com "Não se aplica" guarda o texto, não uma nota', () => {
    const p = perguntas.find((q) => q.id === 'valorizado_voluntario')!;
    let valor: unknown = null;
    const r = render(
      <PublicPaletteCtx.Provider value={PALETA}>
        <PerguntaCampo pergunta={p} valor={valor} onChange={(v) => { valor = v; }} />
      </PublicPaletteCtx.Provider>,
    );
    fireEvent.click(r.getByRole('button', { name: 'Não se aplica' }));
    expect(valor).toBe('Não se aplica');

    r.rerender(
      <PublicPaletteCtx.Provider value={PALETA}>
        <PerguntaCampo pergunta={p} valor={valor} onChange={(v) => { valor = v; }} />
      </PublicPaletteCtx.Provider>,
    );
    fireEvent.click(r.getByRole('button', { name: '4' }));
    expect(valor).toBe(4);
  });

  it('o consentimento só aparece no último bloco', () => {
    montar();
    expect(screen.queryByText('Aceito o aviso de privacidade.')).toBeNull();
  });

  it('a barra de progresso conta o que está visível', () => {
    montar();
    const antes = screen.getByText(/de \d+ respondidas/).textContent!;
    const ec = screen.getByText('Estado civil').parentElement!;
    fireEvent.click(ec.querySelectorAll('button')[0]);
    expect(screen.getByText(/de \d+ respondidas/).textContent).not.toBe(antes);
  });
});
