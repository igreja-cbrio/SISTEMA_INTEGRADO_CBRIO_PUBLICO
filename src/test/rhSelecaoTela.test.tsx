import React from 'react';
import { describe,it,expect,vi,beforeEach } from 'vitest';
import { render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
const mocks=vi.hoisted(()=>({ formulario:vi.fn(),enviar:vi.fn(), user:{id:'u',email:'teste@example.org'} }));
vi.mock('react-router-dom',()=>({useParams:()=>({id:'11111111-1111-4111-8111-111111111111'})}));
vi.mock('../api',()=>({rhSelecao:mocks}));
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:mocks.user,loading:false,signOut:vi.fn()})}));
vi.mock('../components/ui/button',()=>({Button:({children,...props}:any)=><button {...props}>{children}</button>}));
vi.mock('../lib/selecaoRetorno',()=>({guardarRetornoSelecao:vi.fn(),limparRetornoSelecao:vi.fn()}));
import SelecaoInterna from '../pages/admin/rh/SelecaoInterna';
const resposta={processo:{id:'p',titulo:'Interno',status:'aberto',vagas:['Design','Supervisor Financeiro']},funcionario:{nome:'Pessoa Teste',cargo:'Cargo',area:'Equipe'},inscricao:null};
beforeEach(()=>{cleanup();mocks.formulario.mockReset().mockResolvedValue(resposta);mocks.enviar.mockReset();});
describe('Formulário interno',()=>{
  it('reaproveita sessão e preenche o cadastro sem pedir login',async()=>{
    render(<SelecaoInterna/>);expect(await screen.findByDisplayValue('Pessoa Teste')).toBeTruthy();expect(screen.queryByLabelText('Senha do sistema')).toBeNull();
  });
  it('não perde o rascunho ao consultar a confirmação após erro de envio',async()=>{
    mocks.enviar.mockRejectedValue(new Error('Sem confirmação'));
    render(<SelecaoInterna/>);await screen.findByDisplayValue('Pessoa Teste');
    fireEvent.click(screen.getByLabelText('Design'));
    const motivacao=screen.getByLabelText(/Por que você se interessa/);
    const experiencia=screen.getByLabelText(/Conte uma situação/);
    fireEvent.change(motivacao,{target:{value:'Quero contribuir com minha experiência'}});
    fireEvent.change(experiencia,{target:{value:'Organizei um projeto e entreguei no prazo'}});
    fireEvent.click(screen.getByLabelText(/Autorizo o uso/));
    fireEvent.submit(screen.getByText('Enviar inscrição').closest('form')!);
    await screen.findByText(/Sem confirmação/);
    fireEvent.click(screen.getByText('Consultar minha inscrição'));
    await waitFor(()=>expect(mocks.formulario).toHaveBeenCalledTimes(2));
    expect(await screen.findByDisplayValue('Quero contribuir com minha experiência')).toBeTruthy();
    expect(screen.getByDisplayValue('Organizei um projeto e entreguei no prazo')).toBeTruthy();
    expect((screen.getByLabelText('Design') as HTMLInputElement).checked).toBe(true);
  });
  it('confirma inscrição já recebida sem oferecer envio duplicado',async()=>{
    mocks.formulario.mockResolvedValue({...resposta,inscricao:{nome:'Pessoa Teste',vagas:['Design'],criado_em:'2026-10-06T12:00:00Z'}});
    render(<SelecaoInterna/>);expect(await screen.findByText('Inscrição recebida')).toBeTruthy();expect(screen.queryByText('Enviar inscrição')).toBeNull();
  });
});
