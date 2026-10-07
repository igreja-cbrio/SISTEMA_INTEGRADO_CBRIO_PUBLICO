

























import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BirthDatePicker } from '@/components/ui/birth-date-picker';
import { useTecladoVirtual, rolarCampoParaVista } from '@/hooks/useTecladoVirtual';
import { voluntariado } from '@/api';
import { toast } from 'sonner';
import {
  SEXOS, mascaraCpf, mascaraTelefone, soDigitos, tirarCodigoPais, cpfValido,
  telefoneValido, nomeCompletoValido, validarNascimento,
} from '@/lib/inscricao';

export type CampoBase = 'nome' | 'telefone' | 'cpf' | 'data_nascimento' | 'email' | 'sexo';

const ROTULO: Record<CampoBase, string> = {
  nome: 'Nome completo',
  telefone: 'Telefone (WhatsApp)',
  cpf: 'CPF',
  data_nascimento: 'Data de nascimento',
  email: 'E-mail',
  sexo: 'Sexo',
};



const ORDEM: CampoBase[] = ['nome', 'telefone', 'cpf', 'data_nascimento', 'email', 'sexo'];

interface Props {
  volunteerId: string;
  volunteerName: string;

  missingFields: CampoBase[];
  onDone: () => void;
}

export default function CompletarCadastroDialog({ volunteerId, volunteerName, missingFields, onDone }: Props) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [email, setEmail] = useState('');
  const [sexo, setSexo] = useState('');
  const [salvando, setSalvando] = useState(false);



  const { estilo: estiloTeclado, tecladoAberto } = useTecladoVirtual();

  const campos = ORDEM.filter((c) => missingFields.includes(c));
  if (!campos.length) return null;

  const salvar = async () => {


    const payload: Record<string, string> = {};

    if (campos.includes('nome') && nome.trim()) {
      if (!nomeCompletoValido(nome)) return toast.error('Escreva o nome completo, sem abreviações');
      payload.full_name = nome.trim();
    }
    if (campos.includes('telefone') && soDigitos(telefone)) {
      if (!telefoneValido(telefone)) return toast.error('Telefone inválido — DDD + número');




      payload.phone = tirarCodigoPais(soDigitos(telefone));
    }
    if (campos.includes('cpf') && soDigitos(cpf)) {
      if (!cpfValido(cpf)) return toast.error('CPF inválido — confira os dígitos');
      payload.cpf = soDigitos(cpf);
    }
    if (campos.includes('data_nascimento') && nascimento) {
      if (!validarNascimento(nascimento)) return toast.error('Data de nascimento inválida');
      payload.birth_date = nascimento;
    }
    if (campos.includes('email') && email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error('E-mail inválido');
      payload.email = email.trim().toLowerCase();
    }
    if (campos.includes('sexo') && sexo) payload.gender = sexo;



    if (!Object.keys(payload).length) { onDone(); return; }

    setSalvando(true);
    try {
      const r: any = await voluntariado.updateProfileContact(volunteerId, payload);
      const faltaAinda: string[] = r?.missing_fields || [];
      const gravou = campos.filter((c) => !faltaAinda.includes(c)).length;
      toast.success(gravou
        ? `Cadastro atualizado (${gravou} ${gravou === 1 ? 'campo' : 'campos'})`
        : 'Cadastro atualizado');
      onDone();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar');
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onDone(); }}>
      <DialogContent className="max-w-md" style={estiloTeclado}>
        <DialogHeader>
          <DialogTitle>Completar cadastro</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-1">
          Faltam {campos.length === 1 ? 'estes dados' : `${campos.length} dados`} de{' '}
          <span className="font-medium text-foreground">{volunteerName}</span>.
          Aproveite o check-in pra completar — é opcional.
        </p>

        <div className={`space-y-3 py-1 ${tecladoAberto ? '' : 'max-h-[55vh] overflow-y-auto'}`}>
          {campos.includes('nome') && (
            <div>
              <Label htmlFor="cc-nome">{ROTULO.nome}</Label>
              <Input id="cc-nome" autoFocus placeholder="Nome e sobrenome" onFocus={rolarCampoParaVista}
                value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
          )}

          {campos.includes('telefone') && (
            <div>
              <Label htmlFor="cc-telefone">{ROTULO.telefone}</Label>
              <Input id="cc-telefone" inputMode="tel" placeholder="(00) 00000-0000" onFocus={rolarCampoParaVista}
                autoFocus={campos[0] === 'telefone'}
                value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
            </div>
          )}

          {campos.includes('cpf') && (
            <div>
              <Label htmlFor="cc-cpf">{ROTULO.cpf}</Label>
              <Input id="cc-cpf" inputMode="numeric" placeholder="000.000.000-00" onFocus={rolarCampoParaVista}
                autoFocus={campos[0] === 'cpf'}
                value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} />
            </div>
          )}

          {campos.includes('data_nascimento') && (
            <div>
              <Label htmlFor="cc-nascimento">{ROTULO.data_nascimento}</Label>
              <BirthDatePicker id="cc-nascimento" value={nascimento} onChange={setNascimento} />
            </div>
          )}

          {campos.includes('email') && (
            <div>
              <Label htmlFor="cc-email">{ROTULO.email}</Label>
              <Input id="cc-email" type="email" inputMode="email" placeholder="email@exemplo.com" onFocus={rolarCampoParaVista}
                autoFocus={campos[0] === 'email'}
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}

          {campos.includes('sexo') && (
            <div>
              <Label>{ROTULO.sexo}</Label>
              <div className="flex gap-2 mt-1">
                {SEXOS.map((opcao: string) => {
                  const marcado = sexo === opcao;
                  return (
                    <button key={opcao} type="button" aria-pressed={marcado}
                      onClick={() => setSexo(marcado ? '' : opcao)}
                      className={`flex-1 min-h-[44px] rounded-lg border px-3 text-sm capitalize transition ${
                        marcado ? 'border-[#00B39D] bg-[#00B39D]/10 font-semibold' : 'bg-card hover:bg-muted/40'
                      }`}
                    >
                      {opcao}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Sem pressa: o que não for preenchido agora será perguntado no próximo check-in.
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDone} disabled={salvando}>Agora não</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
