















import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, act } from '@testing-library/react';
import MergeFieldPicker from '../components/dedup/MergeFieldPicker';

/* eslint-disable @typescript-eslint/no-explicit-any */

const KEEP: any = {
  id: 'k', nome: 'Andre José de Lima', cpf: null, telefone: '21999999999',
  email: null, data_nascimento: null,
};
const DROP: any = {
  id: 'd', nome: 'André José de Oliveira', cpf: null, telefone: null,
  email: 'a@b.com', data_nascimento: null,
};


function Pai({ onCampos, outrosInline }: { onCampos: (c: unknown) => void; outrosInline?: boolean }) {
  const [, setCampos] = useState<Record<string, unknown>>({});
  return (
    <MergeFieldPicker
      keep={KEEP}


      {...(outrosInline ? { outros: [DROP] } : { drop: DROP })}
      onCampos={(c: Record<string, unknown>) => { setCampos(c); onCampos(c); }}
    />
  );
}

describe('MergeFieldPicker · não pode entrar em laço de render', () => {
  it('⚠️ com props estáveis, avisa o pai UMA vez — é a invariante', async () => {
    const onCampos = vi.fn();
    await act(async () => { render(<Pai onCampos={onCampos} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(onCampos).toHaveBeenCalledTimes(1);
  });

  it('⚠️ nem com a lista de absorvidos remontada a cada render (caso do Grupos)', async () => {
    const onCampos = vi.fn();
    await act(async () => { render(<Pai onCampos={onCampos} outrosInline />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(onCampos).toHaveBeenCalledTimes(1);
  });

  it('avisa o pai com o override real — o conteúdo não pode se perder no conserto', async () => {
    const onCampos = vi.fn();
    await act(async () => { render(<Pai onCampos={onCampos} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });

    expect(onCampos).toHaveBeenCalledWith({ nome: 'André José de Oliveira' });
  });

  it('sem campo divergente, não renderiza nada e ainda assim avisa uma vez só', async () => {
    const onCampos = vi.fn();
    const iguais: any = { id: 'x', nome: 'Ana Souza', cpf: null, telefone: null, email: null, data_nascimento: null };
    await act(async () => {
      render(<MergeFieldPicker keep={iguais} drop={{ ...iguais, id: 'y' }} onCampos={onCampos} />);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(onCampos).toHaveBeenCalledTimes(1);
    expect(onCampos).toHaveBeenCalledWith({});
  });
});
