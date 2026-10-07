import React from 'react';
import { describe,it,expect,vi,beforeEach } from 'vitest';
import { render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
import PADRAO from '../../backend/utils/rhSelecaoFormularioPadrao.json';
const mocks=vi.hoisted(()=>({editarFormulario:vi.fn()}));
vi.mock('../api',()=>({rhSelecao:mocks}));
vi.mock('../components/ui/button',()=>({Button:({children,variant,size,...p}:any)=><button {...p}>{children}</button>}));
vi.mock('../components/ui/dialog',()=>({Dialog:({children}:any)=><div>{children}</div>,DialogContent:({children}:any)=><div>{children}</div>,DialogHeader:({children}:any)=><div>{children}</div>,DialogTitle:({children}:any)=><h2>{children}</h2>,DialogDescription:({children}:any)=><p>{children}</p>}));
import Editor from '../pages/admin/rh/EditorFormularioSelecao';
const processo={id:'p',titulo:'Processo original',formulario_versao:2,formulario:PADRAO};
beforeEach(()=>{cleanup();mocks.editarFormulario.mockReset().mockResolvedValue({...processo,formulario_versao:3});});
describe('Editor de formulário',()=>{
  it('renomeia, remove pergunta, altera obrigatoriedade e salva com versão',async()=>{
    const salvo=vi.fn();render(<Editor processo={processo} onSaved={salvo} onClose={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText('Nome do processo'),{target:{value:'Transferência 2027'}});
    fireEvent.click(screen.getByLabelText('Remover pergunta 1'));
    fireEvent.click(screen.getAllByLabelText('Obrigatória')[0]);
    fireEvent.submit(screen.getByText('Salvar formulário').closest('form')!);
    await waitFor(()=>expect(salvo).toHaveBeenCalled());
    const body=mocks.editarFormulario.mock.calls[0][1];expect(body.titulo).toBe('Transferência 2027');expect(body.versao).toBe(2);expect(body.formulario.campos.some((c:any)=>c.id==='motivacao')).toBe(false);expect(body.formulario.campos[0].obrigatorio).toBe(false);
  });
  it('adiciona pergunta com ID estável e a prévia não grava nada',()=>{
    render(<Editor processo={processo} onSaved={vi.fn()} onClose={vi.fn()}/>);
    fireEvent.click(screen.getByText('Adicionar pergunta'));
    const perguntas=screen.getAllByLabelText('Pergunta');fireEvent.change(perguntas.at(-1)!,{target:{value:'Quais ferramentas você utiliza?'}});
    fireEvent.click(screen.getByText('Prévia do formulário'));
    expect(screen.getByLabelText('Quais ferramentas você utiliza?')).toBeTruthy();expect(mocks.editarFormulario).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Editar'));expect(screen.getByDisplayValue('Quais ferramentas você utiliza?')).toBeTruthy();
  });
  it('mantém alterações não salvas quando o servidor informa conflito',async()=>{
    mocks.editarFormulario.mockRejectedValue(new Error('O formulário foi editado por outra pessoa.'));
    const salvo=vi.fn();render(<Editor processo={processo} onSaved={salvo} onClose={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText('Nome do processo'),{target:{value:'Meu rascunho'}});
    fireEvent.submit(screen.getByText('Salvar formulário').closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('outra pessoa');expect(screen.getByDisplayValue('Meu rascunho')).toBeTruthy();expect(salvo).not.toHaveBeenCalled();
  });
  it('pede confirmação para descartar mudanças ao cancelar',()=>{
    const confirmar=vi.spyOn(window,'confirm').mockReturnValue(false), fechar=vi.fn();
    render(<Editor processo={processo} onSaved={vi.fn()} onClose={fechar}/>);
    fireEvent.change(screen.getByLabelText('Nome do processo'),{target:{value:'Rascunho'}});
    fireEvent.click(screen.getByText('Cancelar'));expect(confirmar).toHaveBeenCalled();expect(fechar).not.toHaveBeenCalled();
    confirmar.mockReturnValue(true);fireEvent.click(screen.getByText('Cancelar'));expect(fechar).toHaveBeenCalled();confirmar.mockRestore();
  });

});
