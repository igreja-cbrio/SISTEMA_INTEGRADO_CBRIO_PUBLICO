import { senhaTotemValida } from '../../../lib/totemSenha';







import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Baby, Users, Printer, AlertTriangle, Plus, ArrowLeft, Loader2, CheckCircle2, Phone, Settings, LogOut, Sparkles, UserPlus, ShieldCheck, Maximize, Lock, Check, Camera, Pencil, X, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';
import { totemKids } from '@/api';
import { TotemKidsConfigTabs } from '@/pages/admin/totemKids/TotemKidsAdmin';
import TotemKidsCheckout from './TotemKidsCheckout';
import EditarEtiquetaModal from './EditarEtiquetaModal';
import QrScanner from '@/pages/ministerial/voluntariado/components/checkin/QrScanner';
import { calcIdadeMeses, formatIdade, formatIdadeShort } from './lib/idade';
import { imprimirEtiquetas, imprimirEtiquetasLote, reimprimirEtiqueta, reimprimirEtiquetasCompletas } from './lib/imprimir';
import * as off from './lib/offlineKids';
import { motivoFalhaBloco } from './lib/motivoBloco';
import { ehFalhaDeRedeOuServidor } from '@/lib/falhaDeRede';
import DataNascimentoPicker from './DataNascimentoPicker';
import useConfirmarSaida from '@/hooks/useConfirmarSaida';
import confetti from 'canvas-confetti';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Crianca = {
  id: string;
  nome: string;
  data_nascimento: string | null;
  foto_url: string | null;
  consent_marketing?: boolean | null;
  observacoes_medicas: string | null;
  tem_espectro: boolean | null;
  espectro_qual: string | null;
  tem_alergia: boolean | null;
  alergia_qual: string | null;
  tem_limitacao_fisica: boolean | null;
  limitacao_fisica_qual: string | null;
  visitante: boolean;
  visitante_relacao?: string | null;
  ativo?: boolean;
  motivo_inativacao?: string | null;
  idade_meses: number | null;
  idade_label: string;
  familia: { id: string; nome: string } | null;
  responsaveis: Array<{
    membro_id: string;
    parentesco: string | null;
    autorizado_buscar: boolean;
    membro: { id: string; nome: string; telefone: string | null; cpf?: string | null; foto_url: string | null } | null;
  }>;
};

type Sala = { id: string; nome: string; cor: string; capacidade: number; faixa_etaria_min_meses: number; faixa_etaria_max_meses: number };
type Sessao = {
  id: string;
  culto: {
    id: string; nome: string; data: string;



    service_type?: { id: string; name: string; color: string | null;
                     has_kids: boolean | null; recurrence_time: string | null } | null;
  } | null;
};


function dispararConfete() {
  const cores = ['#ec4899', '#00B39D', '#f59e0b', '#8b5cf6', '#3b82f6'];
  try {
    confetti({ particleCount: 90, spread: 72, startVelocity: 42, origin: { y: 0.65 }, colors: cores });
    setTimeout(() => confetti({ particleCount: 45, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: cores }), 120);
    setTimeout(() => confetti({ particleCount: 45, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: cores }), 120);
  } catch {                                           }
}

import { KidsZoneShell, KidsZoneRelogio, KidsZoneToggle } from './KidsZoneShell';


import { escolherCultoPorRelogio, periodoKey as _periodoKey } from '@/lib/cultoRelogioKids';





function seletorCultosNecessario(sessoesAbertas: any[], cultoAtualId: string | null): boolean {
  if (sessoesAbertas.length > 1) return true;
  return sessoesAbertas.length === 1 && sessoesAbertas[0].culto_id !== cultoAtualId;
}


function faltaEscolherCulto(sessoesAbertas: any[], cultosSel: Set<string>, cultoAtualId: string | null): boolean {
  if (!sessoesAbertas.length) return false;
  if (sessoesAbertas.some((c: any) => cultosSel.has(c.culto_id))) return false;
  return seletorCultosNecessario(sessoesAbertas, cultoAtualId);
}

function _periodoDia(hora?: string): string {
  const h = Number(String(hora || '').slice(0, 2)) || 0;
  return h < 12 ? 'de manhã' : h < 18 ? 'à tarde' : 'à noite';
}

function rotuloPeriodo(data?: string, hora?: string): string {
  if (!data) return '';
  const dt = new Date(String(data).slice(0, 10) + 'T00:00:00');
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return `${dias[dt.getDay()] || ''} ${_periodoDia(hora)}`.trim();
}

function hojeBRTStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function _sobrenome(nome?: string): string {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return p.length > 1 ? p.slice(1).join(' ') : '';
}




function nomeFamilia(c: any): string {
  const doNome = _sobrenome(c?.nome);
  const familiaLegadoIngles = ['house', 'hold'].join('');
  const padraoLegado = new RegExp(`\\b(${familiaLegadoIngles}|the)\\b`, 'gi');
  const cru = String(c?.familia?.nome || '')
    .replace(padraoLegado, '')
    .replace(/fam[íi]lia/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const melhor = doNome || cru;
  return melhor ? `Família ${melhor}` : 'Família';
}


function cpfValido(cpf: string): boolean {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (base: string, pesoIni: number) => {
    let s = 0;
    for (let i = 0; i < base.length; i++) s += parseInt(base[i], 10) * (pesoIni - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(d.slice(0, 9), 10) === +d[9] && dig(d.slice(0, 10), 11) === +d[10];
}
function formatCpf(v: string): string {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
















const WPP_RETIRADA_ATIVO = false;



function ModalCpfResponsavel({ respNome, onConfirmar, onDispensar, onCancelar }: {
  respNome: string;
  onConfirmar: (cpf: string) => void;
  onDispensar: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [cpf, setCpf] = useState('');
  const [dispensa, setDispensa] = useState(false);
  const [pin, setPin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const ok = cpfValido(cpf);

  const { tentarFechar } = useConfirmarSaida(!!(cpf || pin || motivo), onCancelar);

  async function confirmarDispensa() {
    if (!(await senhaTotemValida(pin))) { setErro('Senha incorreta'); return; }
    onDispensar(motivo.trim());
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) tentarFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-pink-600" /> CPF do responsável</DialogTitle>
          <DialogDescription>
            Pra garantir a <b>segurança na retirada</b>, precisamos do CPF de <b>{respNome}</b>. Fica salvo no cadastro — só pedimos uma vez.
          </DialogDescription>
        </DialogHeader>
        {!dispensa ? (
          <div className="space-y-3">
            <Input autoFocus inputMode="numeric" placeholder="000.000.000-00"
              value={cpf} onChange={(e) => { setCpf(formatCpf(e.target.value)); setErro(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && ok) onConfirmar(cpf.replace(/\D/g, '')); }}
              className="h-14 text-2xl text-center tracking-wider" />
            {!!cpf && !ok && <p className="text-xs text-red-500">CPF incompleto ou inválido.</p>}
            <Button className="w-full bg-pink-600 hover:bg-pink-700 h-12 text-base" disabled={!ok} onClick={() => onConfirmar(cpf.replace(/\D/g, ''))}>
              <Printer className="h-5 w-5 mr-2" /> Confirmar e imprimir
            </Button>
            <button type="button" className="w-full text-xs text-muted-foreground underline pt-1" onClick={() => { setDispensa(true); setErro(''); }}>
              Não tenho o CPF agora
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">Liberar o check-in <b>sem CPF</b> — com a <b>senha do totem</b>. O responsável vai ser cobrado no próximo check-in.</p>
            <Input type="password" inputMode="numeric" placeholder="Senha do totem" value={pin} autoFocus
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setErro(''); }} className="h-12 text-center tracking-widest" />
            <Input placeholder="Motivo (opcional · ex.: estrangeiro, esqueceu o documento)" value={motivo} onChange={(e) => { setMotivo(e.target.value); setErro(''); }} />
            {!!erro && <p className="text-xs text-red-500">{erro}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setDispensa(false); setPin(''); setMotivo(''); setErro(''); }}>Voltar</Button>
              <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmarDispensa}>Liberar sem CPF</Button>
            </div>
          </div>
        )}
        {!!erro && !dispensa && <p className="text-xs text-red-500">{erro}</p>}
      </DialogContent>
    </Dialog>
  );
}




function DispensaCpfInline({ dispensado, onDispensar, onCancelar }: {
  dispensado: boolean;
  onDispensar: () => void;
  onCancelar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pin, setPin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const fechar = () => { setAberto(false); setPin(''); setMotivo(''); setErro(''); };

  if (dispensado) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
        <span className="text-amber-700 dark:text-amber-300">CPF dispensado pelo supervisor · será cobrado no próximo check-in.</span>
        <button type="button" className="underline shrink-0" onClick={() => { onCancelar(); fechar(); }}>Desfazer</button>
      </div>
    );
  }
  if (!aberto) {
    return (
      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setAberto(true)}>
        Não tenho o CPF agora
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-amber-400/60 p-2">
      <p className="text-xs">Liberar o cadastro <b>sem CPF</b> — com a <b>senha do totem</b>. O responsável vai ser cobrado no próximo check-in.</p>
      <Input type="password" inputMode="numeric" placeholder="Senha do totem" value={pin}
        onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setErro(''); }} className="h-10 text-center tracking-widest" />
      <Input placeholder="Motivo (opcional · ex.: estrangeiro, esqueceu o documento)" value={motivo}
        onChange={(e) => { setMotivo(e.target.value); setErro(''); }} />
      {!!erro && <p className="text-xs text-red-500">{erro}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={fechar}>Voltar</Button>
        <Button type="button" size="sm" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={async () => {
          if (!(await senhaTotemValida(pin))) { setErro('Senha incorreta'); return; }
          onDispensar(); setAberto(false);
        }}>Liberar sem CPF</Button>
      </div>
    </div>
  );
}











function ModalSenhaReimpressao({ titulo, onLiberar, onCancelar }: {
  titulo: string;
  onLiberar: () => void;
  onCancelar: () => void;
}) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [verificando, setVerificando] = useState(false);

  async function confirmar() {
    const typed = senha.trim();
    if (!typed || verificando) return;



    setVerificando(true); setErro('');
    try {
      const r: any = await totemKids.editSenha.verificar(typed);
      if (r?.ok) { onLiberar(); return; }
    } catch {                                                                          }
    setErro('Senha incorreta — chame um voluntário do Kids.');
    setSenha('');
    setVerificando(false);
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-pink-600" /> Senha pra reimprimir</DialogTitle>
          <DialogDescription>
            {titulo} — a 2ª via serve pra <b>retirar a criança</b>, então só um <b>voluntário do Kids</b> libera.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input type="password" inputMode="numeric" autoComplete="off" autoFocus placeholder="Senha do totem"
            value={senha} onChange={(e) => { setSenha(e.target.value); setErro(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }}
            className="h-12 text-center text-lg tracking-widest" />
          {!!erro && <p className="text-xs text-red-500">{erro}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancelar}>Cancelar</Button>
            <Button className="flex-1 bg-pink-600 hover:bg-pink-700" disabled={!senha.trim() || verificando} onClick={confirmar}>
              {verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Printer className="h-4 w-4 mr-1" /> Liberar</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}




function precisaPager(c: { idade_meses?: number | null; tem_espectro?: boolean | null; tem_limitacao_fisica?: boolean | null }): boolean {
  const menor4 = c.idade_meses != null && c.idade_meses < 48;
  return menor4 || !!c.tem_espectro || !!c.tem_limitacao_fisica;
}










const TOTEM_KIDS_ATIVO_KEY = 'cbrio-totem-kids-ativo';

export default function TotemKidsCheckin() {
  const navigate = useNavigate();

  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [carregando, setCarregando] = useState(true);


  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Crianca[]>([]);
  const [buscando, setBuscando] = useState(false);


  const [crianca, setCrianca] = useState<Crianca | null>(null);
  const [salaSelecionada, setSalaSelecionada] = useState<string>('');
  const [responsavelSelecionado, setResponsavelSelecionado] = useState<string>('');
  const [respManualNome, setRespManualNome] = useState('');
  const [respManualTel, setRespManualTel] = useState('');
  const [usarRespManual, setUsarRespManual] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);

  const [filaOffline, setFilaOffline] = useState(0);
  const [codigosOffline, setCodigosOffline] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);




  const [motivoBloco, setMotivoBloco] = useState<string | null>(null);




  const recarregarBloco = useCallback(async (sessaoId?: string | null) => {
    try {









      const r: any = await totemKids.checkin.reservarCodigos({
        estacao_ref: off.estacaoRef(),
        sessao_id: sessaoId || null,
        quantidade: 60,
      });
      off.guardarCodigos(r?.codigos || []);
      setCodigosOffline(off.codigosDisponiveis().length);


      setMotivoBloco((r?.codigos || []).length ? null : 'O servidor respondeu, mas não devolveu código nenhum.');
    } catch (e: unknown) {


      setCodigosOffline(off.codigosDisponiveis().length);
      setMotivoBloco(motivoFalhaBloco(e));


      console.error('[totem-kids] não deu pra reservar o bloco offline:', e);
    }
  }, []);




  const sincronizarFila = useCallback(async (silencioso = true) => {
    if (off.filaCount() === 0 || sincronizando) return;
    setSincronizando(true);
    try {
      const r = await off.sincronizar((payload) => totemKids.checkin.criar(payload as any));
      setFilaOffline(off.filaCount());
      if (r.enviados || r.duplicados) {
        toast.success(`${r.enviados + r.duplicados} check-in(s) offline sincronizado(s).`);
      }


      if (r.conflitoDeCodigo.length) {
        toast.error(
          `⚠️ ${r.conflitoDeCodigo.length} etiqueta(s) com código recusado: ${r.conflitoDeCodigo.map(i => `${i.crianca_nome} (${i.codigo})`).join(', ')}. NÃO reimprima — leve à coordenação do Kids.`,
          { duration: 60000 },
        );
      }
      if (!silencioso && !r.enviados && !r.duplicados && r.pendentes) {
        toast.warning(`Ainda sem sistema — ${r.pendentes} na fila.`);
      }
    } finally { setSincronizando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sincronizando]);

  useEffect(() => {
    setFilaOffline(off.filaCount());
    setCodigosOffline(off.codigosDisponiveis().length);
  }, []);

  useEffect(() => {
    if (!sessao?.id) return;
    recarregarBloco(sessao.id);
    sincronizarFila();


    const t = setInterval(() => { recarregarBloco(sessao.id); sincronizarFila(); }, 5 * 60_000);
    const aoVoltar = () => { recarregarBloco(sessao.id); sincronizarFila(); };
    window.addEventListener('online', aoVoltar);
    return () => { clearInterval(t); window.removeEventListener('online', aoVoltar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.id]);

  const [enviarWpp, setEnviarWpp] = useState(WPP_RETIRADA_ATIVO);







  const [sessoesAbertas, setSessoesAbertas] = useState<any[]>([]);


  const [sessoesAbertasTodas, setSessoesAbertasTodas] = useState<any[]>([]);
  const [modoEnsaio, setModoEnsaio] = useState(false);
  const [encerrandoEnsaio, setEncerrandoEnsaio] = useState(false);
  const [cultoAtualId, setCultoAtualId] = useState<string | null>(null);
  const [cultosSel, setCultosSel] = useState<Set<string>>(new Set());
  const criancaAtivaRef = useRef(false);





  const [cultosDoDia, setCultosDoDia] = useState<any[]>([]);
  const [ativandoCulto, setAtivandoCulto] = useState<string | null>(null);




  const [irmaos, setIrmaos] = useState<Crianca[]>([]);
  const [irmaosLoading, setIrmaosLoading] = useState(false);




  const [modalNovo, setModalNovo] = useState(false);
  const [novoContexto, setNovoContexto] = useState<Crianca | null>(null);




  const [cpfPrompt, setCpfPrompt] = useState<{ respNome: string } | null>(null);
  const cpfResolverRef = useRef<((r: { cpf?: string; dispensado?: boolean } | null) => void) | null>(null);
  function garantirCpfResponsavel(cpfAtual: string | null | undefined, respNome: string): Promise<{ cpf?: string; dispensado?: boolean } | null> {
    if (cpfAtual && String(cpfAtual).replace(/\D/g, '').length === 11) return Promise.resolve({});
    return new Promise((resolve) => { cpfResolverRef.current = resolve; setCpfPrompt({ respNome }); });
  }
  function resolverCpfPrompt(r: { cpf?: string; dispensado?: boolean } | null) {
    const fn = cpfResolverRef.current; cpfResolverRef.current = null; setCpfPrompt(null); fn?.(r);
  }


  const [preCodigo, setPreCodigo] = useState('');
  const [preBuscando, setPreBuscando] = useState(false);
  const [scanAberto, setScanAberto] = useState(false);
  const [preCheckin, setPreCheckin] = useState<{
    pre_checkin_id: string;
    responsavel: { membro_id: string; nome: string; telefone: string | null };
  } | null>(null);
  const [preFila, setPreFila] = useState<string[]>([]);
  const [preCheckinIds, setPreCheckinIds] = useState<string[]>([]);


  const [totemMode, setTotemMode] = useState(() => {
    try { return localStorage.getItem(TOTEM_KIDS_ATIVO_KEY) === '1'; } catch { return false; }
  });
  const [pinModal, setPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinErro, setPinErro] = useState('');


  const [ajustesOpen, setAjustesOpen] = useState(false);
  const [ajustesAba, setAjustesAba] = useState('sessoes');

  const [editarEtiquetaOpen, setEditarEtiquetaOpen] = useState(false);

  const [tela, setTela] = useState<'checkin' | 'checkout'>('checkin');


  const [ultimaEtiqueta, setUltimaEtiqueta] = useState<Parameters<typeof imprimirEtiquetas>[0] | null>(null);




  useEffect(() => {
    if (!ultimaEtiqueta) return;
    const t = setTimeout(() => setUltimaEtiqueta(null), 10000);
    return () => clearTimeout(t);
  }, [ultimaEtiqueta]);






  type PagerFluxo = {
    etiquetas: { dados: Parameters<typeof imprimirEtiquetas>[0]; precisa: boolean }[];
    checkinId: string;
    nomes: string[];
    inclusao: boolean;
  };
  const [pagerFluxo, setPagerFluxo] = useState<PagerFluxo | null>(null);
  const [pagerInput, setPagerInput] = useState('');
  const [salvandoPager, setSalvandoPager] = useState(false);
  const [pagerConflito, setPagerConflito] = useState<{ numero: string; emUso: string[] } | null>(null);






  async function imprimirEtiquetasComPager(
    etiquetas: { dados: Parameters<typeof imprimirEtiquetas>[0]; precisa: boolean }[],
    pagerNumero?: string,
  ) {
    const ordenadas = pagerNumero
      ? [...etiquetas].sort((a, b) => Number(b.precisa) - Number(a.precisa))
      : etiquetas;
    const itens = ordenadas.map((e, i) => ({
      d: pagerNumero && e.precisa ? { ...e.dados, pagerNumero } : e.dados,
      incluirRecibo: i === 0,
    }));
    try {
      await imprimirEtiquetasLote(itens);
    } catch {                                                                      }
  }

  function fecharPagerFluxo() {
    setPagerFluxo(null);
    setPagerInput('');
    setPagerConflito(null);
  }




  async function concluirPagerComNumero() {
    if (!pagerFluxo) return;
    const numero = pagerInput.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    if (!numero) { toast.error('Digite o número do pager, ou use "sem pager".'); return; }
    setSalvandoPager(true);
    setPagerConflito(null);
    try {
      const r = await totemKids.checkin.setPager(pagerFluxo.checkinId, numero);
      if (r && r.ok === false && r.conflito) {
        setPagerConflito({ numero, emUso: Array.isArray(r.em_uso) ? r.em_uso : [] });
        setSalvandoPager(false);
        return;
      }
    } catch {
      toast.warning('Não deu pra registrar o pager no sistema, mas a etiqueta vai sair com o número.');
    }
    await imprimirEtiquetasComPager(pagerFluxo.etiquetas, numero);
    setSalvandoPager(false);
    fecharPagerFluxo();
  }



  async function concluirSemPager() {

    if (!pagerFluxo || salvandoPager || pagerFluxo.inclusao) return;
    setSalvandoPager(true);
    await imprimirEtiquetasComPager(pagerFluxo.etiquetas, undefined);
    setSalvandoPager(false);
    fecharPagerFluxo();
  }


  const [etqLayout, setEtqLayout] = useState<Parameters<typeof imprimirEtiquetas>[0]['layout']>(undefined);
  const [logoAniv, setLogoAniv] = useState<string | null>(null);
  useEffect(() => {
    totemKids.etiquetaConfig.get().then((c: any) => {
      if (c) {
        setEtqLayout({ fonte: c.fonte, escalaFonte: c.escala_fonte, nomeTamanho: c.nome_tamanho });
        setLogoAniv(c.logo_aniversario_url || null);
      }
    }).catch(() => {});
  }, []);



  const [checkinAberto, setCheckinAberto] = useState<any>(null);
  const [reimprimindoAberto, setReimprimindoAberto] = useState(false);
  const [reimprimindoCompletoId, setReimprimindoCompletoId] = useState<string | null>(null);

  const [gateReimpressao, setGateReimpressao] = useState<{ titulo: string; executar: () => void } | null>(null);
  function pedirSenhaReimpressao(titulo: string, executar: () => void) {
    setGateReimpressao({ titulo, executar });
  }


  const [abertosAnteriores, setAbertosAnteriores] = useState<any[]>([]);
  const [checkoutAnteriorId, setCheckoutAnteriorId] = useState<string | null>(null);



  const [abertosFamilia, setAbertosFamilia] = useState<Record<string, any>>({});


  function montarDadosEtiqueta(c: Crianca, args: {
    checkinId: string; salaNome: string; salaCor?: string | null; salaLogoUrl?: string | null; respNome: string;
    codigo: string; codigoBarras?: string | null; cultoNome?: string | null; cultoData?: string | null;
  }): Parameters<typeof imprimirEtiquetas>[0] {
    const alergiaLabel = c.tem_alergia ? (c.alergia_qual || 'sim') : null;
    const necessidadeLabel = [
      c.tem_espectro ? `Espectro${c.espectro_qual ? `: ${c.espectro_qual}` : ''}` : '',
      c.tem_limitacao_fisica ? `Limitação${c.limitacao_fisica_qual ? `: ${c.limitacao_fisica_qual}` : ''}` : '',
    ].filter(Boolean).join(' · ') || null;

    const aniversarioSemana = (() => {
      if (!c.data_nascimento) return false;
      const mmdd = (dt: Date) => `${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const hoje = new Date();
      const dias: string[] = [];
      for (let i = 0; i < 7; i++) { const dt = new Date(hoje); dt.setDate(hoje.getDate() + i); dias.push(mmdd(dt)); }
      return dias.includes(String(c.data_nascimento).slice(5, 10));
    })();
    const cultoDiaHora = args.cultoNome
      ? `${args.cultoNome}${args.cultoData ? ` · ${format(new Date(args.cultoData + 'T00:00:00'), 'dd/MM', { locale: ptBR })}` : ''}`
      : undefined;


    const ensaio = !!(args.cultoData && String(args.cultoData).slice(0, 10) > hojeBRTStr());
    return {
      checkinId: args.checkinId,
      criancaId: c.id,
      estacaoId: null,
      crianca: {
        nome: c.nome,
        idadeLabel: formatIdade(c.idade_meses),
        idadeAnos: c.idade_meses != null ? Math.floor(c.idade_meses / 12) : null,
        salaNome: args.salaNome,
        salaCor: args.salaCor,
        salaLogoUrl: args.salaLogoUrl,
        observacoesMedicas: c.observacoes_medicas,
        alergia: alergiaLabel,
        necessidade: necessidadeLabel,




        fotoAutorizada: c.consent_marketing === true,
        aniversarioSemana,
      },
      responsavel: { nome: args.respNome },
      codigoSeguranca: args.codigo,
      codigoBarras: args.codigoBarras || args.codigo,
      dataHora: format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
      cultoNome: args.cultoNome || undefined,
      cultoDiaHora,
      ensaio,
      layout: etqLayout,
      logoAniversarioUrl: logoAniv,
    };
  }

  async function consultarCheckinAberto(sessaoId: string, criancaId: string) {
    try {
      const r: any = await totemKids.checkin.aberto(sessaoId, criancaId);
      setCheckinAberto(r?.checkin || null);
      setAbertosAnteriores(Array.isArray(r?.abertos_anteriores) ? r.abertos_anteriores : []);
    } catch { setCheckinAberto(null); setAbertosAnteriores([]); }
  }

  useEffect(() => {
    setCheckinAberto(null);
    setAbertosAnteriores([]);
    if (!crianca?.id || !sessao?.id) return;
    consultarCheckinAberto(sessao.id, crianca.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crianca?.id, sessao?.id]);





  function carregarIrmaos(criancaId: string, silencioso = false) {
    if (!silencioso) setIrmaosLoading(true);
    return totemKids.criancas.irmaos(criancaId)
      .then((l: Crianca[]) => setIrmaos(Array.isArray(l) ? l : []))
      .catch(() => setIrmaos([]))
      .finally(() => { if (!silencioso) setIrmaosLoading(false); });
  }
  useEffect(() => {
    setIrmaos([]);

    if (!crianca?.id || !crianca?.familia?.id) { setIrmaosLoading(false); return; }
    carregarIrmaos(crianca.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crianca?.id, crianca?.familia?.id]);



  useEffect(() => {
    const membros = crianca ? [crianca, ...irmaos] : [];
    if (!sessao?.id || irmaos.length === 0 || membros.length === 0) { setAbertosFamilia({}); return; }
    let cancel = false;
    Promise.all(membros.map(async (m) => {
      try { const r: any = await totemKids.checkin.aberto(sessao.id, m.id); return [m.id, r?.checkin || null] as const; }
      catch { return [m.id, null] as const; }
    })).then((pares) => {
      if (cancel) return;
      const map: Record<string, any> = {};
      for (const [id, ck] of pares) if (ck) map[id] = ck;
      setAbertosFamilia(map);
    });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crianca?.id, irmaos.map((i) => i.id).join(','), sessao?.id]);


  const atualizarMembro = (id: string, patch: Partial<Crianca>) => {
    setCrianca(c => (c && c.id === id ? { ...c, ...patch } : c));
    setIrmaos(list => list.map(x => (x.id === id ? { ...x, ...patch } : x)));
  };




  async function confirmarCheckinFamilia(
    itens: { crianca: Crianca; sala_id: string }[],
    resp: { membroId: string | null; parentesco: string | null; manual: boolean; nome: string; tel: string; cpfAtual?: string | null },
  ) {
    if (!sessao || !itens.length) return;
    const { sessao_id: sessaoIdFam, cultos_extras: extrasFam } = resolverSessaoCultos();
    if (!sessaoIdFam) { toast.error('Selecione em qual culto a criança fica'); return; }

    const cpfRes = await garantirCpfResponsavel(resp.manual ? null : (resp.cpfAtual || null), resp.nome || 'o responsável');
    if (cpfRes === null) return;
    setImprimindo(true);



    const payload: Record<string, unknown> = {
      sessao_id: sessaoIdFam,
      itens: itens.map((it) => ({ crianca_id: it.crianca.id, sala_id: it.sala_id })),
      cultos_extras: extrasFam, enviar_wpp: enviarWpp,
    };
    if (cpfRes.cpf) payload.responsavel_cpf = cpfRes.cpf;
    if (cpfRes.dispensado) payload.permitir_sem_cpf = true;
    if (resp.manual) {
      payload.responsavel_nome_manual = resp.nome;
      payload.responsavel_telefone_manual = resp.tel;
      payload.responsavel_parentesco = 'outro';
    } else {
      payload.responsavel_id = resp.membroId;
      payload.responsavel_parentesco = resp.parentesco || 'outro';
    }
    let ok = 0, jaTinha = 0, falhou = 0;
    let fluxoPager: PagerFluxo | null = null;
    try {
      const r = await totemKids.checkin.lote(payload);
      const saidas = Array.isArray(r?.resultados) ? r.resultados : [];
      const porId = new Map(itens.map((it) => [it.crianca.id, it.crianca]));



      const etiquetas: { dados: Parameters<typeof imprimirEtiquetas>[0]; precisa: boolean }[] = [];
      const nomesPager: string[] = [];
      let temInclusao = false;
      let checkinRepId = '';
      for (const s of saidas) {
        if (s?.ok) {
          const cr = porId.get(s.crianca_id);
          if (cr) {
            const dados = montarDadosEtiqueta(cr, {
              checkinId: s.checkin.id, salaNome: s.sala.nome, salaCor: s.sala.cor, salaLogoUrl: s.sala.logo_url,
              respNome: s.responsavel.nome, codigo: s.codigo_seguranca, codigoBarras: s.codigo_barras,
              cultoNome: s.sessao.culto?.nome || null, cultoData: s.sessao.culto?.data || null,
            });
            const precisa = precisaPager(cr);
            etiquetas.push({ dados, precisa });
            if (precisa) {
              nomesPager.push(cr.nome.split(' ')[0]);
              if (cr.tem_espectro || cr.tem_limitacao_fisica) temInclusao = true;
            }
            if (!checkinRepId) checkinRepId = s.checkin.id;
          }
          ok++;
        } else if (s?.ja_aberto) jaTinha++;
        else falhou++;
      }
      if (nomesPager.length > 0 && etiquetas.length > 0) {

        fluxoPager = { etiquetas, checkinId: checkinRepId, nomes: nomesPager, inclusao: temInclusao };
      } else {

        await imprimirEtiquetasComPager(etiquetas, undefined);
      }
    } catch (e: unknown) {
      falhou = itens.length;
      toast.error((e as { message?: string })?.message || 'Erro no check-in da família');
    }
    setImprimindo(false);
    if (ok > 0) dispararConfete();
    toast.success(
      `Check-in da família: ${ok} OK`
      + (jaTinha ? ` · ${jaTinha} já estava(m)` : '')
      + (falhou ? ` · ${falhou} não deu` : ''),
      { duration: 5000 },
    );
    if (fluxoPager) setPagerFluxo(fluxoPager);
    setCrianca(null); setBusca(''); setSalaSelecionada(''); setResponsavelSelecionado('');
    setUsarRespManual(false); setRespManualNome(''); setRespManualTel(''); setCultosSel(new Set());
    setResultados([]); setIrmaos([]);
  }



  function reimprimirCheckinAberto() {
    if (!crianca || !checkinAberto) return;
    pedirSenhaReimpressao(`Etiqueta de ${crianca.nome.split(' ')[0]}`, executarReimprimirCheckinAberto);
  }
  async function executarReimprimirCheckinAberto() {
    if (!crianca || !checkinAberto) return;
    setReimprimindoAberto(true);
    try {
      const dados = montarDadosEtiqueta(crianca, {
        checkinId: checkinAberto.id,
        salaNome: checkinAberto.sala?.nome || '',
        salaCor: checkinAberto.sala?.cor || null,
        salaLogoUrl: checkinAberto.sala?.logo_url || null,
        respNome: checkinAberto.responsavel_checkin_nome || '',
        codigo: checkinAberto.codigo_seguranca,
        codigoBarras: checkinAberto.codigo_barras,
        cultoNome: checkinAberto.sessao?.culto?.nome || null,
        cultoData: checkinAberto.sessao?.culto?.data || null,
      });
      await reimprimirEtiqueta(dados, 'crianca', 'Etiqueta perdida — reimpressão pelo totem (liberada com senha)');
      toast.success(`Etiqueta da criança reimpressa · mesmo código ${checkinAberto.codigo_seguranca}`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao reimprimir a etiqueta');
    } finally { setReimprimindoAberto(false); }
  }



  function reimprimirMembroFamilia(ck: any, cr: Crianca) {
    pedirSenhaReimpressao(`Etiqueta de ${cr.nome.split(' ')[0]}`, () => executarReimprimirMembroFamilia(ck, cr));
  }
  async function executarReimprimirMembroFamilia(ck: any, cr: Crianca) {
    try {
      const dados = montarDadosEtiqueta(cr, {
        checkinId: ck.id, salaNome: ck.sala?.nome || '', salaCor: ck.sala?.cor || null,
        salaLogoUrl: ck.sala?.logo_url || null, respNome: ck.responsavel_checkin_nome || '',
        codigo: ck.codigo_seguranca, codigoBarras: ck.codigo_barras,
        cultoNome: ck.sessao?.culto?.nome || null, cultoData: ck.sessao?.culto?.data || null,
      });
      await reimprimirEtiqueta(dados, 'crianca', 'Etiqueta perdida — reimpressão pelo totem (família · liberada com senha)');
      toast.success(`Etiqueta de ${cr.nome.split(' ')[0]} reimpressa · código ${ck.codigo_seguranca}`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao reimprimir');
    }
  }



  function reimprimirCompleto(ck: any, cr: Crianca) {
    if (!ck?.id || reimprimindoCompletoId) return;
    pedirSenhaReimpressao(`Kit completo de ${cr.nome.split(' ')[0]}`, () => executarReimprimirCompleto(ck, cr));
  }
  async function executarReimprimirCompleto(ck: any, cr: Crianca) {
    if (!ck?.id || reimprimindoCompletoId) return;
    setReimprimindoCompletoId(ck.id);
    try {
      const dados = montarDadosEtiqueta(cr, {
        checkinId: ck.id, salaNome: ck.sala?.nome || '', salaCor: ck.sala?.cor || null,
        salaLogoUrl: ck.sala?.logo_url || null, respNome: ck.responsavel_checkin_nome || '',
        codigo: ck.codigo_seguranca, codigoBarras: ck.codigo_barras,
        cultoNome: ck.sessao?.culto?.nome || null, cultoData: ck.sessao?.culto?.data || null,
      });
      await reimprimirEtiquetasCompletas(dados, 'Kit completo perdido — reimpressão pelo totem (liberado com senha)');
      toast.success(`Kit completo de ${cr.nome.split(' ')[0]} reimpresso · código ${ck.codigo_seguranca}`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao reimprimir o kit completo');
    } finally { setReimprimindoCompletoId(null); }
  }


  async function checkoutCultoAnterior(checkinId: string) {
    if (checkoutAnteriorId) return;
    setCheckoutAnteriorId(checkinId);
    try {
      await totemKids.checkout.realizar({ checkin_id: checkinId, metodo: 'painel' });
      toast.success('Check-out do culto anterior registrado');
      if (crianca?.id && sessao?.id) await consultarCheckinAberto(sessao.id, crianca.id);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao fazer o check-out do culto anterior');
    } finally { setCheckoutAnteriorId(null); }
  }
  const [reimprimindo, setReimprimindo] = useState(false);
  async function reimprimir() {
    if (!ultimaEtiqueta) return;
    setReimprimindo(true);

    try { await reimprimirEtiqueta(ultimaEtiqueta, 'crianca', 'Reimpressão pelo totem (não saiu direito)'); toast.success('Etiqueta da criança reenviada pra impressora'); }
    catch (e: unknown) { toast.error((e as { message?: string })?.message || 'Erro ao reimprimir'); }
    finally { setReimprimindo(false); }
  }

  const buscaRef = useRef<HTMLInputElement>(null);

  const PIN_KEY = 'cbrio-totem-kids-pin';

  function abrirAjustes(aba: string = 'sessoes') { setAjustesAba(aba); setAjustesOpen(true); }





  async function carregarCultosDoDia() {
    try {



      try { await totemKids.sessoes.encerrarVencidas(); } catch {             }
      const hoje = hojeBRTStr();





      const doDia: any[] = await totemKids.cultosDoDia(hoje);
      setCultosDoDia(doDia || []);
      const { atual } = escolherCultoPorRelogio(doDia || []);
      let sessaoAtual: any = null;
      if (atual) {
        try { sessaoAtual = await totemKids.sessoes.garantir(atual.id); } catch {                    }
      }


      const abertas: any[] = await totemKids.sessoes.list({ status: 'aberta', limit: 30 });
      const todas = (abertas || []).filter((s: any) => s.culto && String(s.culto?.data).slice(0, 10) >= hoje).map((s: any) => {
        const dataC = String(s.culto?.data).slice(0, 10);
        const futuro = dataC > hoje;
        return {
          culto_id: s.culto_id, sessao_id: s.id,
          nome: futuro ? `TESTE · ${s.culto?.nome} · ${dataC.slice(8, 10)}/${dataC.slice(5, 7)}` : s.culto?.nome,
          data: s.culto?.data, futuro,
          hora: String(s.culto?.service_type?.recurrence_time || '').slice(0, 5), sessao: s,
        };
      }).sort((a: any, b: any) => String(a.data).localeCompare(String(b.data)) || String(a.hora).localeCompare(String(b.hora)));
      setSessoesAbertasTodas(todas);

      const aoVivo = todas.filter((c: any) => !c.futuro);
      const ensaios = todas.filter((c: any) => c.futuro);





      let visiveis = aoVivo;
      if (aoVivo.length) {
        const horaAgora = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit', minute: '2-digit' });
        const perAtual = _periodoKey(atual?.hora || horaAgora);
        const doPeriodo = aoVivo.filter((c: any) => _periodoKey(c.hora) === perAtual);
        visiveis = doPeriodo.length ? doPeriodo : aoVivo;
      }
      const selecionaveis = aoVivo.length ? visiveis : ensaios;
      setSessoesAbertas(selecionaveis);
      setModoEnsaio(!aoVivo.length && ensaios.length > 0);
      setCultoAtualId(atual?.id || null);



      setSessao(sessaoAtual || selecionaveis.find((c: any) => c.culto_id === atual?.id)?.sessao || selecionaveis[0]?.sessao || null);
    } catch {                             }
  }


  function resolverSessaoCultos(): { sessao_id: string | null; cultos_extras: string[] } {
    let marcados = [...cultosSel];




    if (!marcados.length && sessoesAbertas.length === 1 && sessoesAbertas[0].culto_id === cultoAtualId) {
      marcados = [sessoesAbertas[0].culto_id];
    }
    if (!marcados.length) return { sessao_id: null, cultos_extras: [] };

    const chaveDe = (id: string) => {
      const c = sessoesAbertas.find((x: any) => x.culto_id === id);
      return `${String(c?.data || '')}T${String(c?.hora || '')}`;
    };
    const primaryId = (cultoAtualId && cultosSel.has(cultoAtualId))
      ? cultoAtualId
      : [...marcados].sort((a, b) => chaveDe(a).localeCompare(chaveDe(b)))[0];
    const sessao_id = sessoesAbertas.find((c: any) => c.culto_id === primaryId)?.sessao_id || sessao?.id || null;
    return { sessao_id, cultos_extras: marcados.filter((id) => id !== primaryId) };
  }
  function recarregarSessao() {
    carregarCultosDoDia();
    totemKids.salas.list().then(setSalas).catch(() => {});
  }




  async function ativarSessao(cultoId: string, nome?: string) {
    setAtivandoCulto(cultoId);
    try {
      await totemKids.sessoes.garantir(cultoId);
      toast.success(`Sessão de ${nome || 'culto'} ativada.`);
      await carregarCultosDoDia();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Não deu pra ativar a sessão.');
    } finally { setAtivandoCulto(null); }
  }




  function renderCultosAtivar() {
    return (
      <div className="flex flex-wrap gap-2">
        {cultosDoDia.map((c: any) => {
          const aberto = sessoesAbertasTodas.some((s: any) => s.culto_id === c.id);
          return aberto ? (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
              <Check className="h-3.5 w-3.5" /> {c.nome}{c.hora ? ` · ${c.hora}` : ''} · ativo
            </span>
          ) : (
            <Button key={c.id} type="button" variant="outline" size="sm" className="h-8 text-xs"
              disabled={ativandoCulto === c.id} onClick={() => ativarSessao(c.id, c.nome)}>
              {ativandoCulto === c.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              Ativar {c.nome}{c.hora ? ` · ${c.hora}` : ''}
            </Button>
          );
        })}
      </div>
    );
  }





  function destinoLabel(): string {
    const nomeDe = (c: any) => `${c.nome}${c.hora ? ` · ${c.hora}` : ''}`;
    const marcados = sessoesAbertas.filter((c: any) => cultosSel.has(c.culto_id));
    if (marcados.length) return marcados.map(nomeDe).join('  +  ');

    if (sessoesAbertas.length === 1 && sessoesAbertas[0].culto_id === cultoAtualId) return nomeDe(sessoesAbertas[0]);
    const agora = sessoesAbertas.find((c: any) => c.culto_id === cultoAtualId);
    if (agora) return `${nomeDe(agora)} (pré-marcado)`;
    return 'escolha o culto no check-in';
  }



  async function encerrarEnsaio() {
    setEncerrandoEnsaio(true);
    try {
      const ensaios = sessoesAbertasTodas.filter((c: any) => c.futuro);
      let limpos = 0;
      let falhou = false;
      for (const c of ensaios) {
        try {
          const r: any = await totemKids.sessoes.encerrar(c.sessao_id, { limpar_testes: true });
          limpos += r?.testes_limpos || 0;
        } catch (e: unknown) {
          falhou = true;
          toast.error((e as { message?: string })?.message || 'Não deu pra encerrar o ensaio.');
        }
      }
      if (!falhou) toast.success(`Ensaio encerrado${limpos ? ` · ${limpos} check-in(s) de teste limpos` : ''}.`);
      await carregarCultosDoDia();
    } finally { setEncerrandoEnsaio(false); }
  }

  function ativarTotem() {
    document.documentElement.requestFullscreen?.().catch(() => {});
    setTotemMode(true);
    try { localStorage.setItem(TOTEM_KIDS_ATIVO_KEY, '1'); } catch {                                    }
  }



  function iniciarModoTotem() {
    ativarTotem();
  }
  function pedirSairTotem() {
    setPinInput(''); setPinErro(''); setPinModal(true);
  }
  async function confirmarPin() {
    const typed = pinInput.trim();


    let stored = '';
    try { stored = (localStorage.getItem(PIN_KEY) || '').trim(); } catch { stored = ''; }
    if ((!!stored && typed === stored) || await senhaTotemValida(typed)) {
      setPinModal(false); setPinInput(''); setPinErro('');
      setTotemMode(false);
      try { localStorage.removeItem(TOTEM_KIDS_ATIVO_KEY); } catch {                                    }
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } else { setPinErro('Senha incorreta'); setPinInput(''); }
  }


  useEffect(() => {
    totemKids.salas.list().then(setSalas).catch(() => {});
    carregarCultosDoDia().finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  useEffect(() => {
    criancaAtivaRef.current = !!crianca;







    if (crianca) {
      const { atual } = escolherCultoPorRelogio(cultosDoDia);
      const aberto = atual && sessoesAbertas.some((c: any) => c.culto_id === atual.id) ? atual.id : null;
      setCultosSel(aberto ? new Set([aberto]) : new Set());


      setCultoAtualId(atual?.id || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crianca?.id]);
  useEffect(() => {
    const t = setInterval(() => { if (!criancaAtivaRef.current) carregarCultosDoDia(); }, 120000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);







  useEffect(() => {
    if (!crianca && !pagerFluxo) {
      setTimeout(() => buscaRef.current?.focus(), 50);
    }
  }, [crianca, pagerFluxo]);


  useEffect(() => {
    if (busca.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(() => {
      totemKids.criancas.buscar(busca.trim())
        .then((data) => setResultados(data))
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);


  useEffect(() => {
    if (!crianca?.idade_meses) return;
    const sugerida = salas.find(s =>
      s.faixa_etaria_min_meses <= (crianca.idade_meses || 0) &&
      s.faixa_etaria_max_meses >= (crianca.idade_meses || 0)
    );
    if (sugerida) setSalaSelecionada(sugerida.id);
  }, [crianca, salas]);





  useEffect(() => {
    if (usarRespManual) return;
    const valido = (crianca?.responsaveis || []).some(r => r.membro_id === responsavelSelecionado);
    if (responsavelSelecionado && !valido) setResponsavelSelecionado('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crianca?.id]);






  useEffect(() => {
    setCultosSel(cultoAtualId ? new Set([cultoAtualId]) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cultoAtualId, crianca?.id]);



  useEffect(() => {
    if (!crianca || !preCheckin) return;
    const resp = (crianca.responsaveis || []).find(
      r => r.membro_id === preCheckin.responsavel.membro_id && r.autorizado_buscar
    );
    if (resp) {
      setResponsavelSelecionado(preCheckin.responsavel.membro_id);
      setUsarRespManual(false);
    }
  }, [crianca, preCheckin]);



  async function buscarPreCheckin(codigoArg?: string) {
    const cod = (codigoArg ?? preCodigo).trim().toUpperCase();
    if (cod.length < 4) {
      toast.error('Digite o código do app');
      return;
    }
    setPreBuscando(true);
    try {
      const r = await totemKids.preCheckin.buscarCodigo(cod);
      const ids: string[] = (r.criancas || []).map((c: { id: string }) => c.id);
      if (!ids.length) {
        toast.error('Nenhuma criança ativa neste pré-check-in');
        return;
      }
      setPreCheckin({ pre_checkin_id: r.pre_checkin_id, responsavel: r.responsavel });
      setPreCheckinIds([]);
      setPreFila(ids);
      setPreCodigo('');
      toast.success(`Pré-check-in de ${r.responsavel.nome} · ${ids.length} criança(s)`, { duration: 4000 });
      await carregarCriancaDaFila(ids[0]);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Código inválido ou expirado');
    } finally {
      setPreBuscando(false);
    }
  }



  function onScanQR(text: string) {
    setScanAberto(false);
    let limpo = String(text || '').trim();
    if (limpo.includes('/')) limpo = limpo.split('/').filter(Boolean).pop() || limpo;
    const m = limpo.match(/[A-Za-z0-9]{4,8}/);
    const cod = (m ? m[0] : limpo).toUpperCase();
    setPreCodigo(cod);
    buscarPreCheckin(cod);
  }

  async function carregarCriancaDaFila(criancaId: string) {
    try {
      const c = await totemKids.criancas.get(criancaId);
      setCrianca(c);
    } catch {
      toast.error('Erro ao carregar a criança do pré-check-in');
    }
  }







  function selecionarCrianca(c: Crianca) {
    setCrianca(c);
    totemKids.criancas.get(c.id)
      .then((fresh: Crianca) => {
        setCrianca((atual) => (atual && atual.id === c.id ? { ...atual, ...fresh } : atual));
      })
      .catch(() => {                                                  });
  }


  function encerrarPreCheckin() {
    setPreCheckin(null);
    setPreFila([]);
    setPreCheckinIds([]);
  }

  async function abrirSessao() {

    toast.info('Sessão precisa ser criada na admin de Sessões antes do culto', { duration: 5000 });
  }

  async function confirmarCheckin() {
    if (!sessao || !crianca || !salaSelecionada) {
      toast.error('Falta selecionar sala');
      return;
    }
    if (!usarRespManual && !responsavelSelecionado) {
      toast.error('Selecione o responsável que está trazendo');
      return;
    }
    if (usarRespManual && (!respManualNome.trim() || !respManualTel.trim())) {
      toast.error('Preencha nome e telefone do responsável manual');
      return;
    }


    const respSelInd = usarRespManual ? null : crianca.responsaveis.find(r => r.membro_id === responsavelSelecionado);
    const cpfRes = await garantirCpfResponsavel(
      usarRespManual ? null : (respSelInd?.membro?.cpf || null),
      usarRespManual ? (respManualNome.trim() || 'o responsável') : (respSelInd?.membro?.nome || 'o responsável'),
    );
    if (cpfRes === null) return;

    setImprimindo(true);
    try {
      const { sessao_id, cultos_extras } = resolverSessaoCultos();
      if (!sessao_id) { setImprimindo(false); toast.error('Selecione em qual culto a criança fica'); return; }
      const payload: Record<string, unknown> = {
        sessao_id,
        crianca_id: crianca.id,
        sala_id: salaSelecionada,
        cultos_extras,
      };
      if (usarRespManual) {
        payload.responsavel_nome_manual = respManualNome.trim();
        payload.responsavel_telefone_manual = respManualTel.trim();
        payload.responsavel_parentesco = 'outro';
      } else {



        const resp = crianca.responsaveis.find(r => r.membro_id === responsavelSelecionado);
        if (!resp) {
          setImprimindo(false);
          toast.error('Selecione o responsável que está trazendo esta criança');
          return;
        }
        payload.responsavel_id = responsavelSelecionado;
        payload.responsavel_parentesco = resp.parentesco || 'outro';
      }
      payload.enviar_wpp = enviarWpp;
      if (cpfRes.cpf) payload.responsavel_cpf = cpfRes.cpf;
      if (cpfRes.dispensado) payload.permitir_sem_cpf = true;








      let r: any;
      let modoOffline = false;
      try {
        r = await totemKids.checkin.criar(payload);
      } catch (e) {
        if (!ehFalhaDeRedeOuServidor(e)) throw e;

        const codigo = off.sacarCodigo();



        if (!codigo) {
          setImprimindo(false);
          toast.error('Sem sistema e sem códigos reservados. Use a ficha de papel e avise a coordenação do Kids.', { duration: 10000 });
          return;
        }

        const agoraIso = new Date().toISOString();
        const item = off.enfileirar({
          codigo,
          crianca_id: crianca.id,
          crianca_nome: crianca.nome,
          sala_id: salaSelecionada,
          sessao_id: String(sessao_id),
          responsavel_nome: usarRespManual
            ? respManualNome.trim()
            : (crianca.responsaveis.find(x => x.membro_id === responsavelSelecionado)?.membro?.nome || 'Responsável'),
          responsavel_telefone: usarRespManual ? respManualTel.trim() : null,
          checkin_at: agoraIso,
        });
        off.marcarImpresso(item.local_id);
        setFilaOffline(off.filaCount());
        modoOffline = true;



        const salaEscolhida = salas.find((x: any) => x.id === salaSelecionada);
        r = {
          checkin: { id: item.local_id },
          crianca: { nome: crianca.nome },
          sala: { nome: salaEscolhida?.nome || '', cor: salaEscolhida?.cor || null, logo_url: (salaEscolhida as any)?.logo_url || null },
          responsavel: { nome: item.responsavel_nome },
          codigo_seguranca: codigo,
          codigo_barras: codigo,
          sessao: { culto: { nome: sessao?.culto?.nome || null, data: sessao?.culto?.data || null } },
        };
      }



      const dadosEtiqueta = montarDadosEtiqueta(crianca, {
        checkinId: r.checkin.id,
        salaNome: r.sala.nome,
        salaCor: r.sala.cor,
        salaLogoUrl: r.sala.logo_url,
        respNome: r.responsavel.nome,
        codigo: r.codigo_seguranca,
        codigoBarras: r.codigo_barras,
        cultoNome: r.sessao.culto?.nome || null,
        cultoData: r.sessao.culto?.data || null,
      });
      setUltimaEtiqueta(dadosEtiqueta);

      if (modoOffline) {




        toast.warning(`${r.crianca.nome} · SEM SISTEMA · código ${r.codigo_seguranca} · a etiqueta vale, o registro sincroniza depois`, { duration: 9000 });
      } else {
        toast.success(`${r.crianca.nome} · check-in OK · código ${r.codigo_seguranca}`, { duration: 4000 });
        dispararConfete();
      }



      if (crianca && precisaPager(crianca)) {
        setPagerFluxo({
          etiquetas: [{ dados: dadosEtiqueta, precisa: true }],
          checkinId: r.checkin.id,
          nomes: [crianca.nome.split(' ')[0]],






          inclusao: !!(crianca.tem_espectro || crianca.tem_limitacao_fisica),
        });
      } else {
        await imprimirEtiquetas(dadosEtiqueta);
      }


      setCrianca(null);
      setBusca('');
      setSalaSelecionada('');
      setResponsavelSelecionado('');
      setUsarRespManual(false);
      setRespManualNome('');
      setRespManualTel('');
      setCultosSel(new Set());
      setResultados([]);


      if (preCheckin && crianca) {
        const idsFeitos = [...preCheckinIds, r.checkin.id];
        const restante = preFila.filter(id => id !== crianca.id);
        setPreCheckinIds(idsFeitos);
        setPreFila(restante);
        if (restante.length > 0) {
          toast.info(`Faltam ${restante.length} · próxima criança`, { duration: 3000 });
          await carregarCriancaDaFila(restante[0]);
        } else {
          try {
            await totemKids.preCheckin.consumir(preCheckin.pre_checkin_id, { checkin_ids: idsFeitos });
          } catch {                                                           }
          toast.success('Pré-check-in concluído · todas as crianças entraram', { duration: 5000 });
          encerrarPreCheckin();
        }
      }
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string; checkin_existente?: unknown };

      if (err?.status === 409 && crianca && sessao?.id) {
        consultarCheckinAberto(sessao.id, crianca.id);
      }
      toast.error(err?.message || 'Erro no check-in');
    } finally {
      setImprimindo(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }



  const ajustesDialog = (
    <Dialog open={ajustesOpen} onOpenChange={(o) => { setAjustesOpen(o); if (!o) recarregarSessao(); }}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustes do totem</DialogTitle>
          <DialogDescription>Sessões e estações — sem sair do totem.</DialogDescription>
        </DialogHeader>
        {
                                                                                        }
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <div className="text-sm">
            <div className="font-medium">Aparência da etiqueta</div>
            <div className="text-[11px] text-muted-foreground">Tamanho e logo, com prévia de como sai na impressora.</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setAjustesOpen(false); setEditarEtiquetaOpen(true); }}>
            <Pencil className="h-4 w-4 mr-1" /> Editar etiqueta
          </Button>
        </div>
        {

                                                                                }
        <TotemKidsConfigTabs aba={ajustesAba} onAba={setAjustesAba} abas={['sessoes']} />
      </DialogContent>
    </Dialog>
  );

  return (








    <div className={totemMode ? 'fixed inset-0 z-[40] overflow-y-auto' : ''}>
    <KidsZoneShell fullscreen={totemMode}>
      {


                                                               }
      {(filaOffline > 0 || codigosOffline < off.PISO_ALERTA_CODIGOS) && (
        <div className={`mb-4 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 border ${
          filaOffline > 0
            ? 'bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700'
            : 'bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-3">
            <AlertTriangle className={`h-6 w-6 shrink-0 ${filaOffline > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
            <div>
              {filaOffline > 0 ? (
                <>
                  <p className="font-bold text-amber-900 dark:text-amber-100">
                    {filaOffline} check-in{filaOffline > 1 ? 's' : ''} esperando o sistema voltar
                  </p>
                  {

                                                                          }
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    As etiquetas já impressas valem normalmente. Nada se perde — sincroniza sozinho.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-slate-700 dark:text-slate-200">
                    Poucos códigos de reserva ({codigosOffline})
                  </p>
                  <p className="text-sm text-slate-500">
                    O check-in está funcionando normalmente. Sem eles, o que não existe é a
                    reserva para o totem seguir funcionando <b>se o sistema cair</b>.
                  </p>
                  {
                                                                                 }
                  {!!motivoBloco && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{motivoBloco}</p>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{codigosOffline} códigos</span>
            <Button
              size="sm" variant="outline" disabled={sincronizando}
              onClick={() => { recarregarBloco(sessao?.id); sincronizarFila(false); }}
            >
              {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tentar agora'}
            </Button>
          </div>
        </div>
      )}

      {                                                                            }
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-6 border-b border-dashed border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-2xl shadow-lg shadow-pink-500/30">🧸</div>
          <div>
            <p className="text-lg font-black leading-none">Totem Kids</p>
            {                                                                     }
            {sessao?.culto ? (
              <span className={`text-xs font-medium ${modoEnsaio ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>{modoEnsaio ? 'ENSAIO · ' : ''}{rotuloPeriodo(sessao.culto.data, sessao.culto.service_type?.recurrence_time) || sessao.culto.nome}</span>
            ) : (
              <span className="text-xs font-medium text-slate-400">Sem culto de Kids agora</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <KidsZoneRelogio />
          <KidsZoneToggle ativo={tela} onCheckin={() => setTela('checkin')} onCheckout={() => setTela('checkout')} />
          {                                                                                 }
          <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-pink-600" onClick={() => abrirAjustes('sessoes')} title="Ajustes · sessões, estações e editar etiqueta">
            <Settings className="h-5 w-5" />
          </Button>
          {totemMode ? (
            <Button variant="destructive" size="sm" onClick={pedirSairTotem}>
              <Lock className="h-4 w-4 md:mr-1" /> <span className="hidden md:inline">Sair do modo totem</span>
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/kids')}>
                <ArrowLeft className="h-4 w-4 md:mr-1" /> <span className="hidden md:inline">Kids</span>
              </Button>
              <Button variant="default" size="sm" className="bg-pink-600 hover:bg-pink-700" onClick={iniciarModoTotem}>
                <Maximize className="h-4 w-4 md:mr-1" /> <span className="hidden md:inline">Modo totem</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {ajustesDialog}
      <EditarEtiquetaModal
        open={editarEtiquetaOpen}
        onClose={() => {
          setEditarEtiquetaOpen(false);


          totemKids.etiquetaConfig.get().then((c: { fonte?: string; escala_fonte?: string; nome_tamanho?: string; logo_aniversario_url?: string | null } | null) => {
            if (c) {
              setEtqLayout({ fonte: c.fonte, escalaFonte: c.escala_fonte, nomeTamanho: c.nome_tamanho } as Parameters<typeof imprimirEtiquetas>[0]['layout']);
              setLogoAniv(c.logo_aniversario_url || null);
            }
          }).catch(() => {});
        }}
      />

      {

                                                                                }
      {tela === 'checkin' && sessao && !modoEnsaio && (
        <div className="mb-4 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-pink-200 dark:border-pink-900 bg-pink-50 dark:bg-pink-950/30 px-4 py-1.5 text-sm max-w-full">
            <span className="text-slate-500 shrink-0">Registrando em:</span>
            <strong className="text-pink-700 dark:text-pink-300 truncate">{destinoLabel()}</strong>
          </span>
        </div>
      )}
      {

                                                             }
      {tela === 'checkin' && modoEnsaio && (
        <div className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 p-4 flex flex-wrap items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-[220px]">
            <div className="font-black text-amber-800 dark:text-amber-200 tracking-wide">MODO ENSAIO — {destinoLabel()}</div>
            <div className="text-sm text-amber-700 dark:text-amber-300">Check-ins daqui são de TESTE (a etiqueta sai marcada) e somem sozinhos na virada do dia. Não valem como presença.</div>
          </div>
          <Button variant="outline" size="sm" className="border-amber-500 text-amber-700 dark:text-amber-300" disabled={encerrandoEnsaio} onClick={encerrarEnsaio}>
            {encerrandoEnsaio ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
            Encerrar ensaio e limpar testes
          </Button>
        </div>
      )}

      {scanAberto && (
        <Dialog open onOpenChange={(o) => { if (!o) setScanAberto(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Escanear QR do app</DialogTitle>
              <DialogDescription>Aponte a câmera pro QR do pré-check-in do responsável.</DialogDescription>
            </DialogHeader>
            <QrScanner onScan={onScanQR} onError={(e) => toast.error(e || 'Erro ao abrir a câmera')} />
          </DialogContent>
        </Dialog>
      )}

      {



                                                                               }
      {pagerFluxo && (
        <Dialog open onOpenChange={(o) => { if (!o && !salvandoPager && !pagerFluxo.inclusao) concluirSemPager(); }}>
          <DialogContent className="max-w-md" onInteractOutside={(e) => { if (pagerFluxo.inclusao) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (pagerFluxo.inclusao) e.preventDefault(); }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <BellRing className="h-6 w-6" /> Pegue o pager no balcão
              </DialogTitle>
              <DialogDescription>
                Pegue o pager e adicione o número dele abaixo — para{' '}
                <b>{pagerFluxo.nomes.join(', ')}</b>{' '}
                ({pagerFluxo.nomes.length === 1 ? 'criança pequena ou com atenção especial' : 'crianças pequenas ou com atenção especial'}).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-medium">Número do pager</label>
              <Input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                value={pagerInput}
                onChange={(e) => { setPagerInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setPagerConflito(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && pagerInput.trim() && !salvandoPager) concluirPagerComNumero(); }}
                placeholder="ex.: 12"
                className="h-14 text-2xl text-center font-bold tracking-widest"
              />
              {pagerConflito && (
                <p className="text-sm text-red-600 font-medium">
                  Pager {pagerConflito.numero} já está em uso — pegue outro.
                  {pagerConflito.emUso.length > 0 && <> Em uso agora: {pagerConflito.emUso.join(', ')}.</>}
                </p>
              )}
            </div>
            <Button
              className="w-full bg-amber-600 hover:bg-amber-700 text-white h-14 text-lg font-bold"
              disabled={!pagerInput.trim() || salvandoPager}
              onClick={concluirPagerComNumero}
            >
              {salvandoPager ? 'Imprimindo…' : 'Concluir e imprimir'}
            </Button>
            {pagerFluxo.inclusao ? (
              <p className="text-sm text-center font-medium text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2.5">
                Criança de inclusão — o pager é <b>obrigatório</b> pra concluir este check-in.
              </p>
            ) : (
              <button
                type="button"
                className="w-full text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                disabled={salvandoPager}
                onClick={concluirSemPager}
              >
                Sem pager disponível — imprimir mesmo assim
              </button>
            )}
          </DialogContent>
        </Dialog>
      )}

      {tela === 'checkout' ? (
        <TotemKidsCheckout embutido />
      ) : !sessao ? (
        <div className="text-center py-14 space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-3xl shadow-lg shadow-pink-500/30">🧸</div>
          <p className="text-lg text-slate-600">Sem culto de Kids agora</p>
          <p className="text-sm text-slate-400">Não há culto com Kids pra este horário hoje. Quando começar, o check-in libera sozinho.</p>
          {

                                                                 }
          {cultosDoDia.length > 0 && (
            <div className="max-w-md mx-auto rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Precisa liberar agora? Ative a sessão de um culto:</p>
              <div className="flex justify-center">{renderCultosAtivar()}</div>
            </div>
          )}
          <Button variant="outline" onClick={recarregarSessao}>Atualizar</Button>
        </div>
      ) : !crianca ? (
        <div className="space-y-4">
          {                                                                                }
          {ultimaEtiqueta && (
            <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 flex flex-wrap items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-emerald-900 dark:text-emerald-100">
                  Check-in feito ✓
                </div>
                {

                                                                            }
                <div className="text-sm text-emerald-700 dark:text-emerald-300">
                  Etiqueta enviada. Não saiu direito? Imprima de novo.
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={reimprimir} disabled={reimprimindo} variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-300">
                  {reimprimindo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
                  Imprimir de novo
                </Button>
                <Button onClick={() => setUltimaEtiqueta(null)} variant="ghost" size="sm">Ok</Button>
              </div>
            </div>
          )}
          {

                                                                         }
          {cultosDoDia.length > 0 && sessoesAbertasTodas.length === 0 && (
            <div className="max-w-2xl mx-auto w-full rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Nenhuma sessão aberta — ative um culto pra liberar o check-in.</p>
              {renderCultosAtivar()}
            </div>
          )}

          {                                                                                           }
          <div className="text-center">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">Vamos fazer o check-in! 🎈</h1>
            <p className="text-slate-500 mt-0.5 text-xs sm:text-sm">
              Busque a criança pelo nome ou telefone do responsável.
            </p>
          </div>

          {
                                                              }
          <div className="max-w-2xl mx-auto w-full">
            {                    }
            <div className="rounded-2xl border-2 border-slate-100 p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-fuchsia-100 text-fuchsia-500 flex items-center justify-center text-base">🔍</span>
                <h2 className="font-bold text-slate-700 text-sm sm:text-base">Buscar pelo nome da criança</h2>
              </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  ref={buscaRef}
                  type="search"
                  name="busca-crianca"
                  placeholder="Ex.: Sofia, Lucas, Helena... ou telefone"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  onFocus={e => { try { e.currentTarget.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch {            } }}
                  className="pl-10 h-14 text-lg rounded-xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-slate-700"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                />
                {
                                                                          }
                <input type="text" name="fake-email" autoComplete="off" tabIndex={-1} aria-hidden="true"
                  style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }} />
              </div>
              <Button
                onClick={() => setModalNovo(true)}
                variant="default"
                size="lg"
                className="h-14 bg-pink-600 hover:bg-pink-700 whitespace-nowrap rounded-xl"
              >
                <Plus className="h-5 w-5 mr-1" /> Nova criança
              </Button>
            </div>

            {buscando && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-pink-500" />
              </div>
            )}

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {resultados.map(c => (
                <button
                  key={c.id}
                  onClick={() => selecionarCrianca(c)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-pink-50 dark:hover:bg-pink-950/30 transition"
                >
                  {c.foto_url ? (
                    <img src={c.foto_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
                      <Baby className="h-6 w-6 text-pink-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.nome}</span>
                      {c.visitante && <Badge variant="secondary" className="text-xs">visitante</Badge>}
                      {c.ativo === false && (
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-600" title={c.motivo_inativacao || 'Reativa ao fazer o check-in'}>
                          inativa
                        </Badge>
                      )}
                      {(c.tem_alergia || c.tem_espectro || c.tem_limitacao_fisica) && (
                        <AlertTriangle className="h-4 w-4 text-red-500" aria-label="Atenção · saúde" />
                      )}
                      {c.observacoes_medicas && (
                        <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Observação médica" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.idade_label || '?'} · {c.familia ? nomeFamilia(c) : 'sem família'}
                    </div>
                  </div>
                </button>
              ))}
              {!buscando && busca.trim().length >= 2 && resultados.length === 0 && (
                <div className="text-center py-6 space-y-3 border-2 border-dashed border-pink-200 dark:border-pink-900 rounded-lg">
                  <p className="text-muted-foreground">Nenhuma criança encontrada com "{busca}"</p>
                  <Button onClick={() => setModalNovo(true)} variant="default" className="bg-pink-600 hover:bg-pink-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Cadastrar "{busca}" como criança nova
                  </Button>
                </div>
              )}
              {!buscando && busca.trim().length < 2 && resultados.length === 0 && (
                <p className="text-center py-6 text-sm text-muted-foreground">
                  Digite o nome da criança ou clique em <b>Nova criança</b> pra cadastrar.
                </p>
              )}
            </div>
            </div>
          </div>

          {                     }
          <p className="text-center text-xs text-slate-400">
            Precisa de ajuda pra localizar a criança? Chame um voluntário da recepção do Kids. 💛
          </p>
        </div>
      ) : (
        <>
        {preCheckin && (
          <div className="rounded-lg border border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-violet-800 dark:text-violet-200">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>
                Pré-check-in de <b>{preCheckin.responsavel.nome}</b> · faltam <b>{preFila.length}</b> criança(s)
              </span>
            </div>
            <Button variant="ghost" size="sm" className="text-violet-700 dark:text-violet-300" onClick={() => { setCrianca(null); encerrarPreCheckin(); }}>
              Sair do app
            </Button>
          </div>
        )}
        {(!preCheckin && irmaosLoading) ? (
          <Card>
            <CardContent className="p-10 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
              <span className="text-sm text-muted-foreground">Carregando a família de {crianca.nome.split(' ')[0]}…</span>
            </CardContent>
          </Card>
        ) : (!preCheckin && irmaos.length > 0) ? (


          <PainelFamilia
            key={crianca.id}
            primaria={crianca}
            irmaos={irmaos}
            salas={salas}
            sessoesAbertas={sessoesAbertas}
            cultoAtualId={cultoAtualId}
            cultosSel={cultosSel}
            setCultosSel={setCultosSel}
            enviarWpp={enviarWpp}
            setEnviarWpp={setEnviarWpp}
            imprimindo={imprimindo}
            onCancelar={() => { setCrianca(null); if (preCheckin) encerrarPreCheckin(); }}
            onConfirmar={confirmarCheckinFamilia}
            abertos={abertosFamilia}
            onReimprimirMembro={reimprimirMembroFamilia}
            onReimprimirCompleto={reimprimirCompleto}
            reimprimindoCompletoId={reimprimindoCompletoId}
            onAdicionarFilho={() => { setNovoContexto(crianca); setModalNovo(true); }}
            onAtualizarMembro={atualizarMembro}
            onResponsavelCadastrado={async () => {

              try { const fresh = await totemKids.criancas.get(crianca.id); setCrianca({ ...crianca, responsaveis: fresh.responsaveis || [] }); } catch {              }
            }}
          />
        ) : (

          <CheckinSelecao
            crianca={crianca}
            salas={salas}
            salaSelecionada={salaSelecionada}
            setSalaSelecionada={setSalaSelecionada}
            responsavelSelecionado={responsavelSelecionado}
            setResponsavelSelecionado={setResponsavelSelecionado}
            sessoesAbertas={sessoesAbertas}
            cultoAtualId={cultoAtualId}
            cultosSel={cultosSel}
            setCultosSel={setCultosSel}
            irmaos={irmaos}
            onAbrirFamilia={() => {}}
            usarRespManual={usarRespManual}
            setUsarRespManual={setUsarRespManual}
            respManualNome={respManualNome}
            setRespManualNome={setRespManualNome}
            respManualTel={respManualTel}
            setRespManualTel={setRespManualTel}
            onCancelar={() => { setCrianca(null); if (preCheckin) encerrarPreCheckin(); }}
            onConfirmar={confirmarCheckin}
            imprimindo={imprimindo}
            checkinAberto={checkinAberto}
            onReimprimirEtiqueta={reimprimirCheckinAberto}
            onReimprimirCompleto={() => reimprimirCompleto(checkinAberto, crianca)}
            reimprimindoEtiqueta={reimprimindoAberto}
            reimprimindoCompleto={reimprimindoCompletoId === checkinAberto?.id}
            abertosAnteriores={abertosAnteriores}
            onCheckoutAnterior={checkoutCultoAnterior}
            checkoutAnteriorId={checkoutAnteriorId}
            atualizarCrianca={(patch: Partial<Crianca>) => setCrianca(c => (c ? { ...c, ...patch } : c))}
            enviarWpp={enviarWpp}
            setEnviarWpp={setEnviarWpp}
            onResponsavelCadastrado={async () => {

              try {
                const fresh = await totemKids.criancas.get(crianca.id);
                setCrianca({ ...crianca, responsaveis: fresh.responsaveis || [] });
              } catch {                          }
            }}
            onAdicionarIrmao={() => { setNovoContexto(crianca); setModalNovo(true); }}
          />
        )}
        </>
      )}

      <ModalNovaCrianca
        open={modalNovo}
        onClose={() => { setModalNovo(false); setNovoContexto(null); }}
        nomeInicial={novoContexto ? '' : busca}
        referencia={novoContexto ? { id: novoContexto.id, nome: novoContexto.nome, familiaNome: nomeFamilia(novoContexto) } : null}
        onCadastrado={(criancaCriada) => {
          setModalNovo(false);
          if (novoContexto) {


            if (crianca?.id) carregarIrmaos(crianca.id, true);
            setNovoContexto(null);
          } else {
            setCrianca(criancaCriada as Crianca);
            setBusca('');
          }
        }}
      />

      {cpfPrompt && (
        <ModalCpfResponsavel
          respNome={cpfPrompt.respNome}
          onConfirmar={(cpf) => resolverCpfPrompt({ cpf })}
          onDispensar={() => resolverCpfPrompt({ dispensado: true })}
          onCancelar={() => resolverCpfPrompt(null)}
        />
      )}

      {gateReimpressao && (
        <ModalSenhaReimpressao
          titulo={gateReimpressao.titulo}
          onLiberar={() => { const acao = gateReimpressao.executar; setGateReimpressao(null); acao(); }}
          onCancelar={() => setGateReimpressao(null)}
        />
      )}

      {                                                 }
      <Dialog open={pinModal} onOpenChange={(o) => { if (!o) { setPinModal(false); setPinInput(''); setPinErro(''); } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Sair do modo totem</DialogTitle>
            <DialogDescription>
              Digite a <b>senha do totem</b> — a mesma de reimprimir e de liberar sem CPF.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="Senha do totem"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmarPin(); }}
            className="text-center text-2xl tracking-widest font-mono h-14"
            maxLength={8}
            name="totem-pin"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
          />
          {pinErro && <p className="text-sm text-red-500 text-center">{pinErro}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setPinModal(false); setPinInput(''); setPinErro(''); }}>Cancelar</Button>
            <Button className="flex-1 bg-pink-600 hover:bg-pink-700" onClick={confirmarPin}>
              Sair
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </KidsZoneShell>
    </div>
  );
}







function ModalNascimentoObrigatorio({ crianca, onSalvo }: {
  crianca: Crianca;
  onSalvo: (patch: Partial<Crianca>) => void;
}) {
  const [data, setData] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setData(''), [crianca.id]);

  async function salvar() {
    if (!data) { toast.error('Informe dia, mês e ano de nascimento'); return; }
    setSalvando(true);
    try {
      await totemKids.criancas.update(crianca.id, { data_nascimento: data });
      onSalvo({ data_nascimento: data, idade_meses: calcIdadeMeses(data) });
      toast.success(`Idade de ${crianca.nome.split(' ')[0]} atualizada`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao salvar a data de nascimento');
    } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Complete a idade de {crianca.nome.split(' ')[0]}</DialogTitle>
          <DialogDescription>
            A data de nascimento é necessária para indicar a sala correta e concluir o check-in com segurança.
          </DialogDescription>
        </DialogHeader>
        <DataNascimentoPicker value={data} onChange={setData} />
        <Button onClick={salvar} disabled={!data || salvando} className="bg-pink-600 hover:bg-pink-700 text-white">
          {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar e continuar
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function PainelFamilia(props: {
  primaria: Crianca;
  irmaos: Crianca[];
  salas: Sala[];
  sessoesAbertas: any[];
  cultoAtualId: string | null;
  cultosSel: Set<string>;
  setCultosSel: (v: Set<string>) => void;
  enviarWpp: boolean;
  setEnviarWpp: (b: boolean) => void;
  imprimindo: boolean;
  onCancelar: () => void;
  onConfirmar: (
    itens: { crianca: Crianca; sala_id: string }[],
    resp: { membroId: string | null; parentesco: string | null; manual: boolean; nome: string; tel: string; cpfAtual?: string | null },
  ) => void;
  onAdicionarFilho: () => void;
  onAtualizarMembro: (id: string, patch: Partial<Crianca>) => void;
  onResponsavelCadastrado: () => void;
  abertos: Record<string, any>;
  onReimprimirMembro: (checkin: any, crianca: Crianca) => void;
  onReimprimirCompleto: (checkin: any, crianca: Crianca) => void;
  reimprimindoCompletoId: string | null;
}) {
  const { primaria, irmaos, salas, sessoesAbertas, cultoAtualId, cultosSel, setCultosSel,
    enviarWpp, setEnviarWpp, imprimindo, onCancelar, onConfirmar, onAdicionarFilho, onAtualizarMembro, onResponsavelCadastrado,
    abertos, onReimprimirMembro, onReimprimirCompleto, reimprimindoCompletoId } = props;
  const membros = [primaria, ...irmaos];
  const semNascimento = membros.find(m => !m.data_nascimento) || null;
  const jaEntrou = (id: string) => !!abertos[id];
  const salaPorIdade = (c: Crianca) =>
    salas.find(s => c.idade_meses != null
      && s.faixa_etaria_min_meses <= (c.idade_meses || 0)
      && s.faixa_etaria_max_meses >= (c.idade_meses || 0))?.id || '';

  const [sel, setSel] = useState<Set<string>>(() => new Set(membros.map(m => m.id)));
  const [salaPor, setSalaPor] = useState<Record<string, string>>(
    () => Object.fromEntries(membros.map(m => [m.id, salaPorIdade(m)])));
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [modalCadResp, setModalCadResp] = useState(false);


  const seenRef = useRef<Set<string>>(new Set(membros.map(m => m.id)));
  useEffect(() => {
    const novos = membros.filter(m => !seenRef.current.has(m.id));
    if (!novos.length) return;
    setSel(prev => { const n = new Set(prev); novos.forEach(m => n.add(m.id)); return n; });
    setSalaPor(prev => { const n = { ...prev }; novos.forEach(m => { if (!(m.id in n)) n[m.id] = salaPorIdade(m); }); return n; });
    novos.forEach(m => seenRef.current.add(m.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membros.map(m => m.id).join(',')]);


  const respOpcoes = (() => {
    const map = new Map<string, { membro_id: string; nome: string; parentesco: string | null; telefone: string | null; cpf: string | null }>();
    for (const m of membros) for (const r of (m.responsaveis || [])) {
      if (r.autorizado_buscar && r.membro && !map.has(r.membro_id)) {
        map.set(r.membro_id, { membro_id: r.membro_id, nome: r.membro.nome, parentesco: r.parentesco, telefone: r.membro.telefone, cpf: r.membro.cpf ?? null });
      }
    }
    return [...map.values()];
  })();

  const [respId, setRespId] = useState<string>(respOpcoes.length === 1 ? respOpcoes[0].membro_id : '');
  const [manual, setManual] = useState(false);
  const [manualNome, setManualNome] = useState('');
  const [manualTel, setManualTel] = useState('');

  const selecionados = membros.filter(m => sel.has(m.id) && !jaEntrou(m.id));
  const todosEntraram = membros.length > 0 && membros.every(m => jaEntrou(m.id));
  const semSala = selecionados.filter(m => !salaPor[m.id]);
  const respOk = manual ? (!!manualNome.trim() && !!manualTel.trim()) : !!respId;
  const semCulto = faltaEscolherCulto(sessoesAbertas, cultosSel, cultoAtualId);
  const podeConfirmar = selecionados.length > 0 && semSala.length === 0 && respOk && !semCulto && !imprimindo;

  const temTelefoneResp = manual
    ? manualTel.replace(/\D/g, '').length >= 10
    : !!respOpcoes.find(r => r.membro_id === respId)?.telefone;

  function toggle(id: string) {
    setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function confirmar() {
    if (!podeConfirmar) return;


    const respSel = respOpcoes.find(r => r.membro_id === respId);
    if (!manual && !respSel) { toast.error('Selecione o responsável que está trazendo'); return; }
    const itens = selecionados.map(m => ({ crianca: m, sala_id: salaPor[m.id] }));
    onConfirmar(itens, {
      membroId: manual ? null : respId,
      parentesco: manual ? 'outro' : (respSel?.parentesco || 'outro'),
      manual,
      nome: manual ? manualNome.trim() : (respSel?.nome || ''),
      tel: manualTel.trim(),
      cpfAtual: manual ? null : (respSel?.cpf || null),
    });
  }

  const detalhe = detalheId ? (membros.find(m => m.id === detalheId) || null) : null;

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        {                          }
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center shrink-0">
            <Users className="h-6 w-6 text-pink-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold truncate">{nomeFamilia(primaria)}</h2>
            <p className="text-muted-foreground text-sm">{membros.length} criança{membros.length > 1 ? 's' : ''} · marque quem veio hoje</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancelar}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Outra criança
          </Button>
        </div>

        {                                                                            }
        {seletorCultosNecessario(sessoesAbertas, cultoAtualId) && (
          <div>
            <label className="text-sm font-medium block mb-1">Em quais cultos a família vai ficar?</label>
            <p className="text-xs text-muted-foreground mb-2">Escolha o culto — vale pra todos os irmãos marcados. (a etiqueta "agora" é só uma dica do horário atual)</p>
            <div className="space-y-2">
              {sessoesAbertas.map((c: any) => {
                const marcado = cultosSel.has(c.culto_id);
                const ehAgora = c.culto_id === cultoAtualId;
                return (
                  <button key={c.culto_id} type="button"
                    onClick={() => { const n = new Set(cultosSel); if (n.has(c.culto_id)) n.delete(c.culto_id); else n.add(c.culto_id); setCultosSel(n); }}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${marcado ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}>
                    <span className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${marcado ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                      {marcado && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="font-medium flex-1">{c.nome}</span>
                    {ehAgora && <span className="text-[11px] font-semibold uppercase tracking-wide text-primary shrink-0">agora</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {                       }
        <div className="space-y-2">
          <label className="text-sm font-medium block">Quem veio hoje?</label>
          {membros.map(m => {
            const entrou = abertos[m.id];
            const on = sel.has(m.id) && !entrou;
            const temSaude = m.tem_alergia || m.tem_espectro || m.tem_limitacao_fisica || m.observacoes_medicas;
            return (
              <div key={m.id} className={`rounded-lg border p-3 ${entrou ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20' : on ? 'border-pink-400 bg-pink-50/50 dark:bg-pink-950/20' : 'border-border opacity-70'}`}>
                <div className="flex items-center gap-3">
                  {entrou ? (
                    <span className="h-6 w-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0" title="Já fez check-in"><Check className="h-4 w-4" /></span>
                  ) : (
                    <button type="button" onClick={() => toggle(m.id)}
                      className={`h-6 w-6 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-pink-600 border-pink-600 text-white' : 'border-muted-foreground/40'}`}>
                      {on && <Check className="h-4 w-4" />}
                    </button>
                  )}
                  {m.foto_url ? (
                    <img src={m.foto_url} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center shrink-0">
                      <Baby className="h-5 w-5 text-pink-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      <span className="truncate">{m.nome}</span>
                      {temSaude ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" aria-label="Atenção · saúde" /> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatIdade(m.idade_meses) || 'idade não informada'}</div>
                  </div>
                  {

                                                                              }
                  <button type="button" onClick={() => setDetalheId(m.id)} title="Ver/editar a ficha (exige senha do Kids)"
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-pink-600 hover:border-pink-300">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                </div>
                {temSaude ? (
                  <div className="mt-2 pl-9 text-xs space-y-0.5">
                    {m.tem_alergia && <div className="text-red-600 dark:text-red-400"><b>Alergia:</b> {m.alergia_qual || 'sim'}</div>}
                    {m.tem_espectro && <div className="text-red-600 dark:text-red-400"><b>Espectro:</b> {m.espectro_qual || 'sim'}</div>}
                    {m.tem_limitacao_fisica && <div className="text-red-600 dark:text-red-400"><b>Limitação:</b> {m.limitacao_fisica_qual || 'sim'}</div>}
                    {m.observacoes_medicas && <div className="text-amber-600 dark:text-amber-400"><b>Obs.:</b> {m.observacoes_medicas}</div>}
                  </div>
                ) : null}
                {entrou && (
                  <div className="mt-2 pl-9 text-xs space-y-1">
                    <div className="text-emerald-700 dark:text-emerald-300 font-medium">
                      Já fez check-in · código <b className="font-mono tracking-widest">{entrou.codigo_seguranca}</b>{entrou.sala?.nome ? <> · sala <b>{entrou.sala.nome}</b></> : null}
                    </div>
                    <div className="text-muted-foreground">Pra sair, faça o <b>check-out</b>. Perdeu a etiqueta?</div>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-emerald-400 text-emerald-700 dark:text-emerald-300"
                      onClick={() => onReimprimirMembro(entrou, m)}>
                      <Printer className="h-3.5 w-3.5 mr-1" /> Reimprimir etiqueta
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 ml-2 text-xs border-pink-400 text-pink-700 dark:text-pink-300"
                      disabled={reimprimindoCompletoId === entrou.id}
                      onClick={() => onReimprimirCompleto(entrou, m)}>
                      {reimprimindoCompletoId === entrou.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Printer className="h-3.5 w-3.5 mr-1" />}
                      Reimprimir completo
                    </Button>
                  </div>
                )}
                {on && (
                  <div className="mt-2 pl-9">
                    <Select value={salaPor[m.id] || ''} onValueChange={(v) => setSalaPor(s => ({ ...s, [m.id]: v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione a sala" /></SelectTrigger>
                      <SelectContent>
                        {salas.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.cor }} />{s.nome}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {                                         }
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Quem está trazendo? <span className="text-pink-600">*</span></div>
          {!manual ? (
            <>
              {respOpcoes.length === 0 && <p className="text-xs text-muted-foreground">Nenhum responsável autorizado cadastrado — use "Outro responsável".</p>}
              <div className="space-y-1.5">
                {respOpcoes.map(r => (
                  <button key={r.membro_id} type="button" onClick={() => setRespId(r.membro_id)}
                    className={`w-full text-left flex items-center justify-between gap-2 rounded-lg border-2 p-2.5 ${respId === r.membro_id ? 'border-pink-500 bg-pink-50 dark:bg-pink-950/30' : 'border-border hover:border-pink-300'}`}>
                    <span className="text-sm min-w-0 truncate">{r.nome}{r.parentesco ? <span className="text-muted-foreground"> · {r.parentesco}</span> : null}</span>
                    {respId === r.membro_id && <CheckCircle2 className="h-5 w-5 text-pink-600 shrink-0" />}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap pt-0.5">
                <Button type="button" variant="default" size="sm" className="bg-pink-600 hover:bg-pink-700" onClick={() => setModalCadResp(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Cadastrar responsável
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onAdicionarFilho}>
                  <Plus className="h-4 w-4 mr-1" /> Cadastrar criança na família
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setManual(true)}>Outro responsável (manual · não cadastra)</Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Input placeholder="Nome do responsável" value={manualNome} onChange={e => setManualNome(e.target.value)} />
              <Input placeholder="Telefone" value={manualTel} onChange={e => setManualTel(e.target.value)} />
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setManual(false); setManualNome(''); setManualTel(''); }}>Voltar à lista</button>
            </div>
          )}
        </div>

        {WPP_RETIRADA_ATIVO && temTelefoneResp && (
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" className="h-4 w-4 accent-pink-600" checked={enviarWpp} onChange={e => setEnviarWpp(e.target.checked)} />
            <span>Enviar código + QR de retirada por WhatsApp <span className="text-muted-foreground">(a etiqueta imprime de qualquer jeito)</span></span>
          </label>
        )}

        <div className="flex items-center justify-between gap-3 pt-2 border-t">
          <span className={`text-xs font-medium ${todosEntraram ? 'text-emerald-600' : 'text-pink-600'}`}>
            {todosEntraram ? '✓ Todos já fizeram check-in · pra sair, use o check-out' : semCulto ? '↑ Escolha o culto pra liberar' : semSala.length ? '↑ Escolha a sala de cada criança' : !respOk ? '↑ Escolha quem está trazendo' : ''}
          </span>
          <Button className="bg-pink-600 hover:bg-pink-700 text-white" size="lg" onClick={confirmar} disabled={!podeConfirmar}
            title={semCulto ? 'Escolha em qual culto a família fica.' : semSala.length ? 'Selecione a sala de cada criança marcada.' : !respOk ? 'Escolha quem está trazendo.' : undefined}>
            {imprimindo ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Fazendo...</> : <><Printer className="h-5 w-5 mr-2" /> Check-in + imprimir ({selecionados.length})</>}
          </Button>
        </div>
      </CardContent>

      {detalhe && (
        <ModalDetalhesCrianca
          crianca={detalhe}
          atualizarCrianca={(patch: Partial<Crianca>) => onAtualizarMembro(detalhe.id, patch)}
          onClose={() => setDetalheId(null)}
          onAdicionarIrmao={onAdicionarFilho}
        />
      )}

      <ModalCadastrarResponsavel
        open={modalCadResp}
        onClose={() => setModalCadResp(false)}
        criancaId={primaria.id}
        criancaNome={primaria.nome}
        onCadastrado={() => { setModalCadResp(false); onResponsavelCadastrado(); }}
      />
      {semNascimento && (
        <ModalNascimentoObrigatorio
          crianca={semNascimento}
          onSalvo={(patch) => onAtualizarMembro(semNascimento.id, patch)}
        />
      )}
    </Card>
  );
}


function ModalDetalhesCrianca({ crianca, atualizarCrianca, onClose, onAdicionarIrmao }: {
  crianca: Crianca; atualizarCrianca: (p: Partial<Crianca>) => void; onClose: () => void;
  onAdicionarIrmao?: () => void;
}) {
  const [fase, setFase] = useState<'senha' | 'edit'>('senha');
  const [senhaDefinida, setSenhaDefinida] = useState<boolean | null>(null);
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [criandoSenha, setCriandoSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  useEffect(() => {
    totemKids.editSenha.status()
      .then((r: any) => setSenhaDefinida(!!r?.definida))
      .catch(() => setSenhaDefinida(false));
  }, []);

  async function verificar() {






    setVerificando(true); setErro('');
    try {
      const r: any = await totemKids.editSenha.verificar(senha);
      if (r?.naoDefinida) { setSenhaDefinida(false); setErro(''); }
      else if (r?.ok) setFase('edit');
      else { setErro('Senha incorreta.'); setSenha(''); }
    } catch (e: unknown) { setErro((e as { message?: string })?.message || 'Erro'); }
    finally { setVerificando(false); }
  }
  async function criarSenha() {
    if (novaSenha.trim().length < 4) { setErro('A senha precisa ter ao menos 4 caracteres.'); return; }
    setSalvandoSenha(true); setErro('');
    try {
      await totemKids.editSenha.definir(novaSenha.trim());
      toast.success('Senha de edição criada');
      setSenhaDefinida(true); setCriandoSenha(false); setNovaSenha('');
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      setErro(err?.status === 403 ? 'Só líderes do Kids ou administradores podem criar a senha.' : (err?.message || 'Erro ao criar a senha.'));
    } finally { setSalvandoSenha(false); }
  }


  const [form, setForm] = useState({
    nome: crianca.nome || '',
    data_nascimento: crianca.data_nascimento || '',
    observacoes_medicas: crianca.observacoes_medicas || '',
    visitante: !!crianca.visitante,
    visitante_relacao: crianca.visitante_relacao || 'amigo',
    tem_alergia: !!crianca.tem_alergia, alergia_qual: crianca.alergia_qual || '',
    tem_espectro: !!crianca.tem_espectro, espectro_qual: crianca.espectro_qual || '',
    tem_limitacao_fisica: !!crianca.tem_limitacao_fisica, limitacao_fisica_qual: crianca.limitacao_fisica_qual || '',
  });
  const setF = (k: string, v: unknown) => setForm(s => ({ ...s, [k]: v }));
  const [resps, setResps] = useState(() => crianca.responsaveis.map(r => ({ membro_id: r.membro_id, nome: r.membro?.nome || '', telefone: r.membro?.telefone || '', parentesco: r.parentesco || 'outro', foto_url: r.membro?.foto_url || null })));
  const [salvando, setSalvando] = useState(false);
  const [capturaResp, setCapturaResp] = useState<string | null>(null);
  const [consentMkt, setConsentMkt] = useState(false);
  const [consentTocado, setConsentTocado] = useState(false);
  const [camCrianca, setCamCrianca] = useState(false);
  const [salvandoFotoCri, setSalvandoFotoCri] = useState(false);
  const [modalCadResp, setModalCadResp] = useState(false);



  useEffect(() => {
    if (fase !== 'edit') return;
    totemKids.criancas.get(crianca.id).then((d: any) => setConsentMkt(!!d?.consent_marketing)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  async function salvarFotoCrianca(dataUrl: string) {
    setSalvandoFotoCri(true);
    try {
      const r: any = await totemKids.criancas.uploadFoto(crianca.id, dataUrl);
      atualizarCrianca({ foto_url: r?.foto_url || r?.url || r?.signedUrl || dataUrl } as Partial<Crianca>);
      setCamCrianca(false);
      toast.success('Foto da criança atualizada');
    } catch (e: unknown) { toast.error((e as { message?: string })?.message || 'Erro ao salvar a foto'); }
    finally { setSalvandoFotoCri(false); }
  }

  async function salvarTudo() {
    if (form.nome.trim().length < 2) { setErro('Nome da criança muito curto.'); return; }
    setErro(''); setSalvando(true);
    const patch = {
      nome: form.nome.trim(),
      data_nascimento: form.data_nascimento || null,
      observacoes_medicas: form.observacoes_medicas.trim() || null,
      visitante: form.visitante,
      visitante_relacao: form.visitante ? form.visitante_relacao : null,
      tem_alergia: form.tem_alergia, alergia_qual: form.tem_alergia ? form.alergia_qual.trim() || null : null,
      tem_espectro: form.tem_espectro, espectro_qual: form.tem_espectro ? form.espectro_qual.trim() || null : null,
      tem_limitacao_fisica: form.tem_limitacao_fisica, limitacao_fisica_qual: form.tem_limitacao_fisica ? form.limitacao_fisica_qual.trim() || null : null,
      ...(consentTocado ? { consent_marketing: consentMkt } : {}),
    };



    atualizarCrianca({
      ...patch,
      responsaveis: crianca.responsaveis.map(r => {
        const m = resps.find(x => x.membro_id === r.membro_id);
        if (!m) return r;
        return {
          ...r,
          membro: {
            ...(r.membro || {}),
            id: r.membro?.id || r.membro_id,
            nome: m.nome.trim() || r.membro?.nome || '',
            telefone: m.telefone.trim() || r.membro?.telefone || null,
          },
        };
      }),
    } as Partial<Crianca>);
    toast.success('Ficha atualizada');
    onClose();


    (async () => {
      try {
        await totemKids.criancas.update(crianca.id, patch);
        for (const r of resps) {
          const orig = crianca.responsaveis.find(x => x.membro_id === r.membro_id);
          const patchResp: Record<string, string> = {};
          if (r.nome.trim().length >= 2 && r.nome.trim() !== (orig?.membro?.nome || '')) patchResp.nome = r.nome.trim();
          const telLimpo = r.telefone.replace(/\D/g, '');
          const telOrig = String(orig?.membro?.telefone || '');
          if (r.telefone.trim() && telLimpo.length >= 10 && r.telefone.trim() !== telOrig) patchResp.telefone = r.telefone.trim();
          if (Object.keys(patchResp).length) await totemKids.criancas.updateResponsavelMembro(r.membro_id, patchResp);

          if (r.parentesco && r.parentesco !== (orig?.parentesco || '')) await totemKids.criancas.updateResponsavelVinculo(crianca.id, r.membro_id, { parentesco: r.parentesco });
        }
      } catch {
        toast.error(`Não deu pra salvar a ficha de ${crianca.nome?.split(' ')[0] || 'a criança'} — refaça a edição.`);
      }
    })();
  }

  async function promoverFrequentador() {



    setF('visitante', false); setF('visitante_relacao', 'amigo');
    atualizarCrianca({ visitante: false, visitante_relacao: null } as Partial<Crianca>);
    try {
      await totemKids.criancas.tornarFrequentador(crianca.id);
      toast.success('Agora é frequentador (deixou de ser visitante).');
    } catch {
      toast.error('Não deu pra tornar frequentador — salve pela edição.');
    }
  }

  async function removerResp(membroId: string) {
    if (resps.length <= 1) { toast.error('A criança precisa ter ao menos um responsável.'); return; }
    if (!window.confirm('Remover este responsável da criança? (não apaga o cadastro da pessoa, só o vínculo)')) return;
    try {
      await totemKids.criancas.removeResponsavelVinculo(crianca.id, membroId);
      setResps(list => list.filter(x => x.membro_id !== membroId));
      atualizarCrianca({ responsaveis: crianca.responsaveis.filter(x => x.membro_id !== membroId) } as Partial<Crianca>);
      toast.success('Responsável removido');
    } catch (e: unknown) { toast.error((e as { message?: string })?.message || 'Erro ao remover'); }
  }



  const respsMudou = JSON.stringify(resps.map(r => ({ m: r.membro_id, n: r.nome.trim(), t: String(r.telefone).trim(), p: r.parentesco })))
    !== JSON.stringify(crianca.responsaveis.map(r => ({ m: r.membro_id, n: (r.membro?.nome || '').trim(), t: String(r.membro?.telefone || '').trim(), p: r.parentesco || 'outro' })));
  const temAlteracoes = fase === 'edit' && (
    form.nome !== (crianca.nome || '')
    || form.data_nascimento !== (crianca.data_nascimento || '')
    || form.observacoes_medicas !== (crianca.observacoes_medicas || '')
    || form.visitante !== !!crianca.visitante
    || (form.visitante && form.visitante_relacao !== (crianca.visitante_relacao || 'amigo'))
    || form.tem_alergia !== !!crianca.tem_alergia || form.alergia_qual !== (crianca.alergia_qual || '')
    || form.tem_espectro !== !!crianca.tem_espectro || form.espectro_qual !== (crianca.espectro_qual || '')
    || form.tem_limitacao_fisica !== !!crianca.tem_limitacao_fisica || form.limitacao_fisica_qual !== (crianca.limitacao_fisica_qual || '')
    || consentTocado
    || respsMudou
  );
  const { tentarFechar } = useConfirmarSaida(temAlteracoes, onClose);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) tentarFechar(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fase === 'edit' ? `Editar ficha · ${crianca.nome.split(' ')[0]}` : 'Editar ficha da criança'}</DialogTitle>
          <DialogDescription>
            {fase === 'edit' ? 'Corrija os dados da criança e dos responsáveis.' : 'Por segurança, a edição exige a senha do Kids.'}
          </DialogDescription>
        </DialogHeader>

        {fase === 'senha' ? (
          <div className="space-y-3">
            {


                                                                                  }
            <div className="space-y-2">
              <Input type="password" inputMode="numeric" autoComplete="new-password" autoFocus placeholder="Senha do totem"
                value={senha} onChange={e => setSenha(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') verificar(); }} className="h-12 text-center text-lg" />
              <Button className="w-full bg-pink-600 hover:bg-pink-700" onClick={verificar} disabled={verificando || !senha.trim()}>
                {verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Desbloquear edição'}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                A senha do totem — a mesma de reimprimir. A senha do Kids da liderança também vale.
              </p>
            </div>
            {senhaDefinida === false && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Ainda não há <b>senha do Kids</b> da liderança (a que vale também fora do totem, na Gestão de Crianças).
                  Só <b>líder do Kids</b> ou <b>administrador</b> pode criar.
                </p>
                {!criandoSenha ? (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => { setCriandoSenha(true); setErro(''); }}>
                    Sou líder ou administrador · criar senha do Kids
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Input type="password" inputMode="numeric" autoComplete="new-password" placeholder="Nova senha (mín. 4)"
                      value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') criarSenha(); }} className="h-12 text-center text-lg" />
                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1" onClick={() => { setCriandoSenha(false); setErro(''); }}>Cancelar</Button>
                      <Button className="flex-1 bg-pink-600 hover:bg-pink-700" onClick={criarSenha} disabled={salvandoSenha}>
                        {salvandoSenha ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar senha'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {erro && <p className="text-sm text-destructive text-center">{erro}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {                                                      }
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setCamCrianca(true)} title="Tirar/atualizar foto da criança"
                className="relative h-16 w-16 rounded-full shrink-0">
                {crianca.foto_url
                  ? <img src={crianca.foto_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                  : <div className="h-16 w-16 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center"><Baby className="h-7 w-7 text-pink-500" /></div>}
                <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full bg-pink-600 text-white flex items-center justify-center shadow ring-2 ring-background"><Camera className="h-3 w-3" /></span>
              </button>
              <label className="flex items-start gap-2 text-xs rounded-md border border-border p-2 cursor-pointer flex-1">
                <input type="checkbox" className="mt-0.5" checked={consentMkt} onChange={e => { setConsentMkt(e.target.checked); setConsentTocado(true); }} />
                <span>Autoriza o <b>uso da imagem</b> da criança (redes sociais, site, etc.)</span>
              </label>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Nome da criança</label>
              <Input value={form.nome} onChange={e => setF('nome', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Nascimento</label>
                <DataNascimentoPicker value={form.data_nascimento} onChange={(v) => setF('data_nascimento', v)} />
              </div>
              <label className="flex items-center gap-2 mt-6 text-sm cursor-pointer">
                <input type="checkbox" checked={form.visitante} onChange={e => setF('visitante', e.target.checked)} /> Visitante
              </label>
            </div>
            {form.visitante && (
              <div className="space-y-1.5 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-2">
                <label className="text-xs text-muted-foreground block">Relação com a família</label>
                <Select value={form.visitante_relacao} onValueChange={(v) => setF('visitante_relacao', v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Relação" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amigo">Amigo(a)</SelectItem>
                    <SelectItem value="primo">Primo(a)</SelectItem>
                    <SelectItem value="vizinho">Vizinho(a)</SelectItem>
                    <SelectItem value="irmao">Irmão/Irmã</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" className="w-full h-8 text-xs mt-1" onClick={promoverFrequentador}>
                  Tornar frequentador (deixa de ser visitante)
                </Button>
                <p className="text-[11px] text-amber-700 dark:text-amber-300">Visitante fica visível no check-in por ~4 semanas; depois sai sozinho se não voltar.</p>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Observações médicas</label>
              <Input value={form.observacoes_medicas} onChange={e => setF('observacoes_medicas', e.target.value)} placeholder="ex.: usa inalador" />
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.tem_alergia} onChange={e => setF('tem_alergia', e.target.checked)} /> Alergia
              </label>
              {form.tem_alergia && <Input value={form.alergia_qual} onChange={e => setF('alergia_qual', e.target.value)} placeholder="Qual alergia?" />}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.tem_espectro} onChange={e => setF('tem_espectro', e.target.checked)} /> Espectro autista
              </label>
              {form.tem_espectro && <Input value={form.espectro_qual} onChange={e => setF('espectro_qual', e.target.value)} placeholder="Detalhe (opcional)" />}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.tem_limitacao_fisica} onChange={e => setF('tem_limitacao_fisica', e.target.checked)} /> Limitação física
              </label>
              {form.tem_limitacao_fisica && <Input value={form.limitacao_fisica_qual} onChange={e => setF('limitacao_fisica_qual', e.target.value)} placeholder="Detalhe (opcional)" />}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Responsáveis</label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setModalCadResp(true)}><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
              </div>
              {resps.length === 0 && <p className="text-xs text-muted-foreground mb-1">Nenhum responsável ainda — clique em Adicionar.</p>}
                <div className="space-y-2">
                  {resps.map((r, i) => {
                    const orig = crianca.responsaveis.find(x => x.membro_id === r.membro_id);
                    return (
                      <div key={r.membro_id} className="rounded-lg border border-border p-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">Responsável {i + 1}</span>
                          {resps.length > 1 && (
                            <button type="button" onClick={() => removerResp(r.membro_id)} className="text-muted-foreground hover:text-red-500" title="Remover responsável"><X className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                        <Input value={r.nome} placeholder="Nome do responsável"
                          onChange={e => setResps(list => list.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} />
                        <Input value={r.telefone} placeholder="Telefone (WhatsApp)" inputMode="tel"
                          onChange={e => setResps(list => list.map((x, j) => j === i ? { ...x, telefone: e.target.value } : x))} />
                        <Select value={r.parentesco} onValueChange={v => setResps(list => list.map((x, j) => j === i ? { ...x, parentesco: v } : x))}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Parentesco" /></SelectTrigger>
                          <SelectContent>
                            {                                                               }
                            <SelectItem value="mae" disabled={r.parentesco !== 'mae' && resps.some((x, j) => j !== i && x.parentesco === 'mae')}>Mãe{r.parentesco !== 'mae' && resps.some((x, j) => j !== i && x.parentesco === 'mae') ? ' (já tem)' : ''}</SelectItem>
                            <SelectItem value="pai" disabled={r.parentesco !== 'pai' && resps.some((x, j) => j !== i && x.parentesco === 'pai')}>Pai{r.parentesco !== 'pai' && resps.some((x, j) => j !== i && x.parentesco === 'pai') ? ' (já tem)' : ''}</SelectItem>
                            <SelectItem value="padrasto">Padrasto</SelectItem>
                            <SelectItem value="madrasta">Madrasta</SelectItem>
                            <SelectItem value="avo_a">Avô/Avó</SelectItem>
                            <SelectItem value="tio_a">Tio/Tia</SelectItem>
                            <SelectItem value="irmao_a">Irmão/Irmã</SelectItem>
                            <SelectItem value="tutor">Tutor</SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                            {r.foto_url ? <img src={r.foto_url} alt="" className="h-full w-full object-cover" /> : <Camera className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCapturaResp(r.membro_id)}>
                            {r.foto_url ? 'Refazer foto' : 'Tirar foto'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Alterar aqui atualiza o cadastro da pessoa no sistema inteiro (membresia, voluntariado etc.).
                </p>
              </div>
            {onAdicionarIrmao && (
              <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => { onClose(); onAdicionarIrmao(); }}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar irmão a esta família
              </Button>
            )}
            {erro && <p className="text-sm text-destructive text-center">{erro}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={salvando}>Cancelar</Button>
              <Button className="flex-1 bg-pink-600 hover:bg-pink-700" onClick={salvarTudo} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
      {capturaResp && (
        <WebcamCaptura
          titulo="Foto do responsável"
          salvando={false}
          onCapturar={async (dataUrl) => {
            const mid = capturaResp;
            try {
              await totemKids.criancas.uploadFotoResponsavel(mid, dataUrl);
              setResps(list => list.map(x => x.membro_id === mid ? { ...x, foto_url: dataUrl } : x));
              atualizarCrianca({ responsaveis: crianca.responsaveis.map(rr => rr.membro_id === mid ? { ...rr, membro: { ...(rr.membro || {}), id: rr.membro?.id || mid, foto_url: dataUrl } } : rr) } as Partial<Crianca>);
              toast.success('Foto do responsável atualizada');
            } catch (e: unknown) { toast.error((e as { message?: string })?.message || 'Erro ao salvar a foto'); }
            setCapturaResp(null);
          }}
          onFechar={() => setCapturaResp(null)}
        />
      )}
      {camCrianca && (
        <WebcamCaptura
          titulo={`Foto de ${crianca.nome.split(' ')[0]}`}
          salvando={salvandoFotoCri}
          onCapturar={salvarFotoCrianca}
          onFechar={() => setCamCrianca(false)}
        />
      )}
      <ModalCadastrarResponsavel
        open={modalCadResp}
        onClose={() => setModalCadResp(false)}
        criancaId={crianca.id}
        criancaNome={crianca.nome}
        onCadastrado={async () => {
          setModalCadResp(false);
          try {
            const fresh: any = await totemKids.criancas.get(crianca.id);
            const novos = fresh?.responsaveis || [];
            setResps(novos.map((r: any) => ({ membro_id: r.membro_id, nome: r.membro?.nome || '', telefone: r.membro?.telefone || '', parentesco: r.parentesco || 'outro', foto_url: r.membro?.foto_url || null })));
            atualizarCrianca({ responsaveis: novos } as Partial<Crianca>);
            toast.success('Responsável adicionado');
          } catch {              }
        }}
      />
    </Dialog>
  );
}


function WebcamCaptura({ titulo, salvando, onCapturar, onFechar }: {
  titulo: string; salvando: boolean; onCapturar: (dataUrl: string) => void; onFechar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [erro, setErro] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
      .then(stream => {
        if (cancel) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      })
      .catch(() => setErro('Não consegui acessar a câmera. Confira a permissão e se a webcam está conectada.'));
    return () => { cancel = true; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  function capturar() {
    const v = videoRef.current; if (!v) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 640; canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    setPreview(canvas.toDataURL('image/jpeg', 0.85));
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Enquadre a criança e toque em Capturar.</DialogDescription>
        </DialogHeader>
        {erro ? (
          <p className="text-sm text-destructive text-center py-6">{erro}</p>
        ) : preview ? (
          <div className="space-y-3">
            <img src={preview} alt="" className="w-full rounded-xl object-cover" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPreview(null)} disabled={salvando}>Refazer</Button>
              <Button className="flex-1 bg-pink-600 hover:bg-pink-700" onClick={() => onCapturar(preview)} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Usar foto
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black aspect-[4/3] object-cover" />
            <Button className="w-full bg-pink-600 hover:bg-pink-700" onClick={capturar}><Camera className="h-4 w-4 mr-1" /> Capturar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


function CheckinSelecao(props: {
  crianca: Crianca;
  salas: Sala[];
  salaSelecionada: string;
  setSalaSelecionada: (s: string) => void;
  responsavelSelecionado: string;
  setResponsavelSelecionado: (s: string) => void;
  sessoesAbertas: any[];
  cultoAtualId: string | null;
  cultosSel: Set<string>;
  setCultosSel: (v: Set<string>) => void;
  irmaos: Crianca[];
  onAbrirFamilia: () => void;
  usarRespManual: boolean;
  setUsarRespManual: (b: boolean) => void;
  respManualNome: string;
  setRespManualNome: (s: string) => void;
  respManualTel: string;
  setRespManualTel: (s: string) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
  imprimindo: boolean;
  checkinAberto: any;
  onReimprimirEtiqueta: () => void;
  onReimprimirCompleto: () => void;
  reimprimindoEtiqueta: boolean;
  reimprimindoCompleto: boolean;
  abertosAnteriores: any[];
  onCheckoutAnterior: (checkinId: string) => void;
  checkoutAnteriorId: string | null;
  atualizarCrianca: (patch: Partial<Crianca>) => void;
  onResponsavelCadastrado: () => void;
  onAdicionarIrmao?: () => void;
  enviarWpp: boolean;
  setEnviarWpp: (b: boolean) => void;
}) {
  const { crianca, salas, salaSelecionada, setSalaSelecionada,
    responsavelSelecionado, setResponsavelSelecionado,
    sessoesAbertas, cultoAtualId, cultosSel, setCultosSel, irmaos, onAbrirFamilia,
    usarRespManual, setUsarRespManual,
    respManualNome, setRespManualNome, respManualTel, setRespManualTel,
    atualizarCrianca,
    onCancelar, onConfirmar, imprimindo,
    checkinAberto, onReimprimirEtiqueta, onReimprimirCompleto, reimprimindoEtiqueta, reimprimindoCompleto,
    abertosAnteriores, onCheckoutAnterior, checkoutAnteriorId,
    onResponsavelCadastrado, onAdicionarIrmao, enviarWpp, setEnviarWpp } = props;


  const temTelefoneResp = usarRespManual
    ? respManualTel.replace(/\D/g, '').length >= 10
    : !!crianca.responsaveis.find(r => r.membro_id === responsavelSelecionado)?.membro?.telefone;


  const [modalCadResp, setModalCadResp] = useState(false);
  useEffect(() => {
    if (crianca.responsaveis.filter(r => r.autorizado_buscar).length === 0) {
      setModalCadResp(true);
    }
  }, [crianca.id, crianca.responsaveis]);


  const [camAberta, setCamAberta] = useState(false);
  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const [detalhesOpen, setDetalhesOpen] = useState(false);

  async function salvarFoto(dataUrl: string) {
    setSalvandoFoto(true);
    try {
      const r: any = await totemKids.criancas.uploadFoto(crianca.id, dataUrl);
      atualizarCrianca({ foto_url: r?.foto_url || r?.url || r?.signedUrl || dataUrl });
      setCamAberta(false);
      toast.success('Foto da criança atualizada');
    } catch (e: unknown) { toast.error((e as { message?: string })?.message || 'Erro ao salvar foto'); }
    finally { setSalvandoFoto(false); }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-4">
          {                                     }
          <button type="button" onClick={() => setCamAberta(true)} title="Tirar/atualizar foto da criança"
            className="relative h-20 w-20 rounded-full shrink-0 group">
            {crianca.foto_url ? (
              <img src={crianca.foto_url} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="h-20 w-20 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
                <Baby className="h-10 w-10 text-pink-500" />
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-full bg-pink-600 text-white flex items-center justify-center shadow ring-2 ring-background">
              <Camera className="h-3.5 w-3.5" />
            </span>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="truncate">{crianca.nome}</span>
              <button type="button" onClick={() => setDetalhesOpen(true)} title="Editar ficha da criança (exige senha do Kids)"
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-pink-600 hover:border-pink-300">
                <Pencil className="h-3.5 w-3.5" /> Editar ficha
              </button>
            </h2>
            <p className="text-muted-foreground">
              {formatIdade(crianca.idade_meses) || 'idade não informada'}
              {crianca.familia && <> · {nomeFamilia(crianca)}</>}
              {crianca.visitante && <> · <Badge variant="secondary" className="ml-1">visitante</Badge></>}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancelar}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Outra criança
          </Button>
        </div>

        {camAberta && (
          <WebcamCaptura
            titulo={`Foto de ${crianca.nome.split(' ')[0]}`}
            salvando={salvandoFoto}
            onCapturar={salvarFoto}
            onFechar={() => setCamAberta(false)}
          />
        )}

        {detalhesOpen && (
          <ModalDetalhesCrianca
            crianca={crianca}
            atualizarCrianca={atualizarCrianca}
            onClose={() => setDetalhesOpen(false)}
            onAdicionarIrmao={onAdicionarIrmao}
          />
        )}

        {                                                                                      }
        {irmaos.length > 0 && (
          <button type="button" onClick={onAbrirFamilia}
            className="w-full flex items-center gap-3 rounded-xl border-2 border-pink-300 bg-pink-50 dark:bg-pink-950/30 px-4 py-3 text-left hover:border-pink-400 transition">
            <Users className="h-6 w-6 text-pink-600 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-pink-700 dark:text-pink-300">Fazer check-in da família</span>
              <span className="block text-xs text-muted-foreground">
                {crianca.nome.split(' ')[0]} + {irmaos.length} irmão{irmaos.length > 1 ? 's' : ''} de uma vez
              </span>
            </span>
            <span className="text-xs font-medium text-pink-600 shrink-0">Abrir</span>
          </button>
        )}

        {(crianca.tem_alergia || crianca.tem_espectro || crianca.tem_limitacao_fisica) && (
          <div className="bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="space-y-0.5">
              <div className="font-semibold text-red-700 dark:text-red-300">ATENÇÃO · SAÚDE</div>
              {crianca.tem_alergia && <div className="text-sm"><b>Alergia:</b> {crianca.alergia_qual || 'sim'}</div>}
              {crianca.tem_espectro && <div className="text-sm"><b>Espectro autista:</b> {crianca.espectro_qual || 'sim'}</div>}
              {crianca.tem_limitacao_fisica && <div className="text-sm"><b>Limitação física:</b> {crianca.limitacao_fisica_qual || 'sim'}</div>}
            </div>
          </div>
        )}
        {crianca.observacoes_medicas && (
          <div className="bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <div className="font-semibold">ATENÇÃO MÉDICA</div>
              <div className="text-sm">{crianca.observacoes_medicas}</div>
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-2">Sala</label>
          <Select value={salaSelecionada} onValueChange={setSalaSelecionada}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Selecione a sala" />
            </SelectTrigger>
            <SelectContent>
              {salas.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: s.cor }} />
                    {s.nome}
                    <span className="text-muted-foreground text-xs ml-2">
                      ({formatIdadeShort(s.faixa_etaria_min_meses)}–{formatIdadeShort(s.faixa_etaria_max_meses)})
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {


                                                     }
        {seletorCultosNecessario(sessoesAbertas, cultoAtualId) && (
          <div>
            <label className="text-sm font-medium block mb-1">Em quais cultos a criança vai ficar?</label>
            <p className="text-xs text-muted-foreground mb-2">Escolha o culto. Marque mais de um só se a criança realmente ficar em mais de um. (a etiqueta "agora" é só uma dica do horário atual)</p>
            <div className="space-y-2">
              {sessoesAbertas.map((c: any) => {
                const marcado = cultosSel.has(c.culto_id);
                const ehAgora = c.culto_id === cultoAtualId;
                return (
                  <button
                    key={c.culto_id}
                    type="button"
                    onClick={() => { const n = new Set(cultosSel); if (n.has(c.culto_id)) n.delete(c.culto_id); else n.add(c.culto_id); setCultosSel(n); }}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${marcado ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}
                  >
                    <span className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${marcado ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                      {marcado && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="font-medium flex-1">{c.nome}</span>
                    {ehAgora && <span className="text-[11px] font-semibold uppercase tracking-wide text-primary shrink-0">agora</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-semibold block">Quem está trazendo? <span className="text-pink-600">*</span></label>
          <p className="text-xs text-muted-foreground mb-2">Toque no responsável pra liberar a impressão.</p>
          {!checkinAberto && (!usarRespManual ? !responsavelSelecionado : (!respManualNome.trim() || !respManualTel.trim())) && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border-2 border-pink-300 bg-pink-50 dark:bg-pink-950/30 px-3 py-2.5">
              <AlertTriangle className="h-5 w-5 text-pink-600 shrink-0" />
              <span className="text-sm font-semibold text-pink-700 dark:text-pink-300">
                Selecione quem está trazendo a criança para liberar a impressão da etiqueta.
              </span>
            </div>
          )}
          {!usarRespManual ? (
            <>
              <div className="space-y-2">
                {crianca.responsaveis.filter(r => r.autorizado_buscar).map(r => {
                  const sel = responsavelSelecionado === r.membro_id;
                  return (
                  <button
                    key={r.membro_id}
                    onClick={() => setResponsavelSelecionado(r.membro_id)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 transition cursor-pointer ${
                      sel
                        ? 'bg-pink-50 dark:bg-pink-950/30 border-pink-500 ring-1 ring-pink-300'
                        : 'bg-card border-slate-200 dark:border-slate-700 hover:border-pink-300 hover:bg-pink-50/40'
                    }`}
                  >
                    {r.membro?.foto_url ? (
                      <img src={r.membro.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                        {(r.membro?.nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.membro?.nome}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {r.parentesco && <span>{r.parentesco}</span>}
                        {r.membro?.telefone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {r.membro.telefone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {sel
                        ? <CheckCircle2 className="h-6 w-6 text-pink-600" />
                        : <span className="block h-5 w-5 rounded-full border-2 border-slate-300" />}
                    </div>
                  </button>
                  );
                })}
                {crianca.responsaveis.length === 0 && (
                  <div className="text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg p-3">
                    <p className="font-semibold mb-1">⚠ Sem responsáveis cadastrados</p>
                    <p className="text-muted-foreground text-xs">
                      Cadastre o responsável agora pra deixar o histórico completo, ou clique em "Outro responsável" pra registrar manualmente.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Button
                  variant="default"
                  size="sm"
                  className="bg-pink-600 hover:bg-pink-700"
                  onClick={() => setModalCadResp(true)}
                >
                  <Plus className="h-4 w-4 mr-1" /> Cadastrar responsável
                </Button>
                {onAdicionarIrmao && (
                  <Button type="button" variant="outline" size="sm" onClick={onAdicionarIrmao}>
                    <Plus className="h-4 w-4 mr-1" /> Cadastrar criança na família
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUsarRespManual(true)}
                >
                  Outro responsável (manual · não cadastra)
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Nome do responsável"
                value={respManualNome}
                onChange={e => setRespManualNome(e.target.value)}
              />
              <Input
                placeholder="Telefone"
                value={respManualTel}
                onChange={e => setRespManualTel(e.target.value)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setUsarRespManual(false); setRespManualNome(''); setRespManualTel(''); }}
              >
                Voltar à lista
              </Button>
            </div>
          )}
        </div>

        {
                                                  }
        {abertosAnteriores.length > 0 && (
          <div className="rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-300 dark:border-sky-800 p-3 space-y-2">
            <p className="text-sm">
              <b>{crianca.nome.split(' ')[0]}</b> ainda consta presente em outro culto — o check-out não foi feito:
            </p>
            {abertosAnteriores.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-sky-200 dark:border-sky-900 px-2.5 py-1.5">
                <span className="text-sm min-w-0 truncate">
                  {a.sessao?.culto?.nome || 'Culto'}
                  {a.sessao?.culto?.data ? ` · ${format(new Date(a.sessao.culto.data + 'T00:00:00'), 'dd/MM', { locale: ptBR })}` : ''}
                  <span className="text-xs text-muted-foreground"> · código {a.codigo_seguranca}</span>
                </span>
                <Button size="sm" variant="outline" className="shrink-0 border-sky-400 text-sky-700 dark:text-sky-300"
                  disabled={!!checkoutAnteriorId} onClick={() => onCheckoutAnterior(a.id)}>
                  {checkoutAnteriorId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Fazer check-out'}
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Isso não impede o check-in de agora — é só pra regularizar o registro do culto anterior.
            </p>
          </div>
        )}

        {
                                                                              }
        {checkinAberto && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-3 space-y-2">
            <p className="text-sm">
              <b>{crianca.nome.split(' ')[0]}</b> já está com check-in nessa sessão · código{' '}
              <b className="font-mono tracking-widest">{checkinAberto.codigo_seguranca}</b>
              {checkinAberto.sala?.nome ? <> · sala <b>{checkinAberto.sala.nome}</b></> : null}.
            </p>
            <p className="text-xs text-muted-foreground">
              Perdeu a etiqueta? Imprima de novo — sai com o mesmo código. Um novo check-in só é
              possível depois do check-out (quando a criança sai e volta).
            </p>
            <Button onClick={onReimprimirEtiqueta} disabled={reimprimindoEtiqueta} variant="outline"
              className="w-full border-amber-400 text-amber-700 dark:text-amber-300">
              {reimprimindoEtiqueta ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
              Imprimir etiqueta de novo
            </Button>
            <Button onClick={onReimprimirCompleto} disabled={reimprimindoCompleto} variant="outline"
              className="w-full border-pink-400 text-pink-700 dark:text-pink-300">
              {reimprimindoCompleto ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
              Reimprimir completo (criança + responsável)
            </Button>
          </div>
        )}

        {WPP_RETIRADA_ATIVO && temTelefoneResp && !checkinAberto && (
          <label className="flex items-center gap-2 pt-1 text-sm cursor-pointer select-none">
            <input type="checkbox" className="h-4 w-4 accent-pink-600"
              checked={enviarWpp} onChange={e => setEnviarWpp(e.target.checked)} />
            <span>Enviar código + QR de retirada por WhatsApp pro responsável <span className="text-muted-foreground">(a etiqueta é impressa de qualquer jeito)</span></span>
          </label>
        )}

        <div className="flex justify-end items-center gap-3 pt-2">
          {(() => {

            const faltaResp = !usarRespManual ? !responsavelSelecionado : (!respManualNome.trim() || !respManualTel.trim());
            const faltaCulto = faltaEscolherCulto(sessoesAbertas, cultosSel, cultoAtualId);
            const bloqueado = !checkinAberto && (!salaSelecionada || faltaResp || faltaCulto);
            return (
          <>
          {!checkinAberto && (faltaCulto || faltaResp) && (
            <span className="text-xs text-pink-600 font-medium">
              {faltaCulto ? '↑ Escolha o culto pra imprimir'
                : usarRespManual ? '↑ Preencha o responsável pra imprimir'
                : '↑ Toque em quem está trazendo pra imprimir'}
            </span>
          )}
          <Button
            size="lg"
            onClick={onConfirmar}
            disabled={imprimindo || !!checkinAberto || bloqueado}
            title={
              checkinAberto ? 'Já existe check-in aberto — reimprima a etiqueta ou faça o check-out antes.'
              : bloqueado ? 'Escolha o culto, a sala e o responsável pra liberar a impressão.'
              : undefined
            }
            className="bg-pink-600 hover:bg-pink-700 text-white"
          >
            {imprimindo ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Imprimindo...</>
            ) : (
              <><Printer className="h-5 w-5 mr-2" /> Imprimir & Confirmar</>
            )}
          </Button>
          </>
            );
          })()}
        </div>
      </CardContent>

      <ModalCadastrarResponsavel
        open={modalCadResp}
        onClose={() => setModalCadResp(false)}
        criancaId={crianca.id}
        criancaNome={crianca.nome}
        onCadastrado={() => {
          setModalCadResp(false);
          onResponsavelCadastrado();
        }}
      />
      {!crianca.data_nascimento && (
        <ModalNascimentoObrigatorio crianca={crianca} onSalvo={atualizarCrianca} />
      )}
    </Card>
  );
}


function ModalNovaCrianca(props: {
  open: boolean;
  onClose: () => void;
  nomeInicial: string;


  referencia?: { id: string; nome: string; familiaNome: string | null } | null;
  onCadastrado: (c: Crianca) => void;
}) {
  const emptyCrianca = () => ({
    nome: '', nasc: '', sexo: '', foto: null as string | null, consent: false,
    temAlergia: false, alergiaQual: '', temEspectro: false, espectroQual: '',
    temLimitacao: false, limitacaoQual: '', obsMed: '',









    visitante: true, visitanteRelacao: 'outros',
  });


  const [criancas, setCriancas] = useState<any[]>([{ ...emptyCrianca(), nome: props.nomeInicial }]);
  const [resps, setResps] = useState<any[]>([{ nome: '', telefone: '', cpf: '', parentesco: 'mae', autorizado_buscar: true, foto: null }]);
  const [captura, setCaptura] = useState<{ tipo: 'crianca' | 'resp'; i: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [dispensaCpf, setDispensaCpf] = useState(false);

  const [familiaSugerida, setFamiliaSugerida] = useState<{ membro: { id: string; nome: string }; familia_nome: string | null; ref_crianca_id: string; criancas: { id: string; nome: string }[] } | null>(null);
  const setCri = (i: number, patch: any) => setCriancas(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const addCri = () => setCriancas(cs => [...cs, emptyCrianca()]);
  const delCri = (i: number) => setCriancas(cs => cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs);
  const setResp = (i: number, patch: any) => setResps(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addResp = () => setResps(rs => [...rs, { nome: '', telefone: '', cpf: '', parentesco: 'outro', autorizado_buscar: true, foto: null }]);
  const delResp = (i: number) => setResps(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs);

  useEffect(() => {
    if (props.open) {
      setCriancas([{ ...emptyCrianca(), nome: props.nomeInicial }]);
      setResps([{ nome: '', telefone: '', cpf: '', parentesco: 'mae', autorizado_buscar: true, foto: null }]);
      setCaptura(null);
      setDispensaCpf(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.nomeInicial, props.referencia?.id]);

  const Toggle = ({ on, set, label }: { on: boolean; set: (b: boolean) => void; label: string }) => (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <span className="text-sm">{label}</span>
      <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
        {
                                                                                   }
        <button type="button" onClick={() => set(false)} className={`px-3 py-1 ${!on ? 'bg-pink-600 text-white font-medium' : ''}`}>Não</button>
        <button type="button" onClick={() => set(true)} className={`px-3 py-1 ${on ? 'bg-pink-600 text-white font-medium' : ''}`}>Sim</button>
      </div>
    </div>
  );

  const montarCrianca = (c: any) => ({
    nome: c.nome.trim(), data_nascimento: c.nasc || null, sexo: c.sexo || null,
    observacoes_medicas: c.obsMed.trim() || null, consent_marketing: c.consent,
    tem_alergia: c.temAlergia, alergia_qual: c.temAlergia ? c.alergiaQual.trim() || null : null,
    tem_espectro: c.temEspectro, espectro_qual: c.temEspectro ? c.espectroQual.trim() || null : null,
    tem_limitacao_fisica: c.temLimitacao, limitacao_fisica_qual: c.temLimitacao ? c.limitacaoQual.trim() || null : null,
    visitante: !!c.visitante,
    visitante_relacao: c.visitante ? (c.visitanteRelacao || 'outros') : null,
  });

  async function salvar() {
    const validasCri = criancas.filter(c => c.nome.trim());
    if (!validasCri.length) { toast.error('Informe o nome de ao menos uma criança'); return; }
    if (validasCri.some(c => !c.nasc)) { toast.error('Informe a data de nascimento de todas as crianças'); return; }
    const validos = props.referencia ? [] : resps.filter(r => r.nome.trim() && r.telefone.trim());
    if (!props.referencia && !validos.length) { toast.error('Informe ao menos um responsável (nome e telefone)'); return; }

    if (!props.referencia && !dispensaCpf && validos.some(r => !cpfValido(r.cpf || ''))) {
      toast.error('CPF do responsável é obrigatório. Se não tiver agora, use "Não tenho o CPF agora".');
      return;
    }




    if (!props.referencia && !dispensaCpf) {
      const cpfPrincipal = validos.map(r => (r.cpf || '').replace(/\D/g, '')).find(cpf => cpfValido(cpf));
      if (cpfPrincipal) {
        try {
          const m: any = await totemKids.criancas.responsavelFamilia(cpfPrincipal);
          if (m?.encontrado && Array.isArray(m.criancas) && m.criancas.length && m.ref_crianca_id) {
            setFamiliaSugerida(m);
            return;
          }
        } catch {                                   }
      }
    }
    await executarCadastro(null);
  }




  async function executarCadastro(joinRefId: string | null, revisar?: { membroId: string; familiaNome: string | null } | null) {
    const validasCri = criancas.filter(c => c.nome.trim());
    const validos = props.referencia ? [] : resps.filter(r => r.nome.trim() && r.telefone.trim());
    const juntando = !!(joinRefId || props.referencia);
    setSalvando(true);
    try {
      let primeiroId: string | null = joinRefId || props.referencia?.id || null;
      let primeiroCriado: any = null;
      for (let i = 0; i < validasCri.length; i++) {
        const c = validasCri[i];


        const body = (juntando || primeiroCriado)
          ? { crianca: montarCrianca(c), amigo_de_crianca_id: primeiroId }
          : { crianca: montarCrianca(c), permitir_sem_cpf: dispensaCpf || undefined, responsaveis: validos.map(x => ({ nome: x.nome.trim(), telefone: x.telefone.trim(), cpf: x.cpf?.trim() || null, parentesco: x.parentesco, autorizado_buscar: x.autorizado_buscar })) };
        const r = await totemKids.criancas.create(body);
        const cid = r?.crianca?.id;
        if (cid && c.foto) { try { await totemKids.criancas.uploadFoto(cid, c.foto); } catch {            } }
        if (i === 0 && !juntando) {
          primeiroId = cid; primeiroCriado = r?.crianca;
          const retResps = Array.isArray(r?.responsaveis) ? r.responsaveis : [];
          for (let j = 0; j < retResps.length; j++) {
            if (validos[j]?.foto && retResps[j]?.id) { try { await totemKids.criancas.uploadFotoResponsavel(retResps[j].id, validos[j].foto); } catch {            } }
          }
        } else if (i === 0) {
          primeiroCriado = r?.crianca;
        }
      }

      if (revisar?.membroId && primeiroCriado?.id) {
        totemKids.criancas.familiaRevisar({ crianca_id: primeiroCriado.id, responsavel_membro_id: revisar.membroId, familia_existente_nome: revisar.familiaNome }).catch(() => {});
      }
      toast.success(validasCri.length > 1 ? `${validasCri.length} crianças cadastradas` : `${primeiroCriado?.nome || 'Criança'} cadastrada`);


      if (juntando) {
        props.onCadastrado(primeiroCriado as Crianca);
      } else {
        const detalhe = await totemKids.criancas.buscar(validasCri[0].nome.trim());
        const found = detalhe.find((x: { id: string }) => x.id === primeiroId) || primeiroCriado;
        props.onCadastrado(found as Crianca);
      }
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao cadastrar');
    } finally {
      setSalvando(false);
    }
  }

  const temAlteracoes = (
    criancas.some((c, i) => (i === 0 ? c.nome.trim() !== (props.nomeInicial || '').trim() : !!c.nome.trim())
      || !!c.nasc || !!c.sexo || c.temAlergia || c.temEspectro || c.temLimitacao || !!c.obsMed.trim() || !!c.foto || c.consent)
    || resps.some(r => r.nome.trim() || r.telefone.trim() || (r.cpf || '').trim())
  );
  const { tentarFechar } = useConfirmarSaida(temAlteracoes, props.onClose);

  return (
    <>
    <Dialog open={props.open} onOpenChange={(o) => { if (!o) tentarFechar(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{props.referencia ? `Adicionar à ${props.referencia.familiaNome || 'família'}` : 'Cadastrar criança(s)'}</DialogTitle>
          <DialogDescription>
            {props.referencia
              ? 'As crianças novas entram nesta família e herdam os responsáveis dela.'
              : 'Dados mínimos · LGPD com menores (sem CPF da criança). Dá pra cadastrar irmãos/primos/amigos que vieram juntos de uma vez.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          {                              }
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Crianças</div>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addCri}><Plus className="h-3.5 w-3.5" /> Adicionar criança</Button>
            </div>
            {criancas.map((c, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Criança {i + 1}</span>
                  {criancas.length > 1 && <button type="button" onClick={() => delCri(i)} className="text-muted-foreground hover:text-red-500" title="Remover"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <Input placeholder="Nome da criança *" value={c.nome} onChange={e => setCri(i, { nome: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <DataNascimentoPicker value={c.nasc} onChange={(v) => setCri(i, { nasc: v })} />
                  <Select value={c.sexo} onValueChange={(v) => setCri(i, { sexo: v })}>
                    <SelectTrigger><SelectValue placeholder="Sexo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Menino</SelectItem>
                      <SelectItem value="F">Menina</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {c.foto ? <img src={c.foto} alt="" className="h-full w-full object-cover" /> : <Baby className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCaptura({ tipo: 'crianca', i })}>
                    <Camera className="h-3.5 w-3.5 mr-1" /> {c.foto ? 'Refazer foto' : 'Tirar foto'}
                  </Button>
                  {c.foto && <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setCri(i, { foto: null })}>Remover</Button>}
                </div>
                <label className="flex items-start gap-2 text-xs rounded-md border border-border p-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={c.consent} onChange={e => setCri(i, { consent: e.target.checked })} />
                  <span>Autoriza o <b>uso da imagem</b> da criança (redes sociais, site, etc.)</span>
                </label>
                {           }
                <Toggle on={c.temAlergia} set={(b) => setCri(i, { temAlergia: b })} label="Tem alergia" />
                {c.temAlergia && <Input placeholder="Qual alergia?" value={c.alergiaQual} onChange={e => setCri(i, { alergiaQual: e.target.value })} />}
                <Toggle on={c.temEspectro} set={(b) => setCri(i, { temEspectro: b })} label="Está no espectro autista" />
                {c.temEspectro && <Input placeholder="Qual? (nível, observações)" value={c.espectroQual} onChange={e => setCri(i, { espectroQual: e.target.value })} />}
                <Toggle on={c.temLimitacao} set={(b) => setCri(i, { temLimitacao: b })} label="Limitação física / deficiência" />
                {c.temLimitacao && <Input placeholder="Qual limitação?" value={c.limitacaoQual} onChange={e => setCri(i, { limitacaoQual: e.target.value })} />}
                <Input placeholder="Observações médicas (medicação, cuidados...)" value={c.obsMed} onChange={e => setCri(i, { obsMed: e.target.value })} />
                {


                                                                             }
                {c.visitante && (
                  <div className="space-y-1.5 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-2">
                    <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                      Entra como <b>visitante</b> — vira frequentadora sozinha na 3ª visita.
                    </p>
                    <label className="text-xs text-muted-foreground block">Relação com a família <span className="text-muted-foreground/70">(opcional)</span></label>
                    <Select value={c.visitanteRelacao || 'outros'} onValueChange={(v) => setCri(i, { visitanteRelacao: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Relação" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amigo">Amigo(a)</SelectItem>
                        <SelectItem value="primo">Primo(a)</SelectItem>
                        <SelectItem value="vizinho">Vizinho(a)</SelectItem>
                        <SelectItem value="irmao">Irmão/Irmã</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      O prazo de ~4 semanas é RENOVADO a cada check-in — só sai da lista quem não voltar mesmo.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {                                                                        }
          {props.referencia ? (
            <div className="rounded-lg border border-pink-400/40 bg-pink-50/50 dark:bg-pink-950/20 p-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-pink-600 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{props.referencia.familiaNome || `Família de ${props.referencia.nome.split(' ')[0]}`}</div>
                <div className="text-xs text-muted-foreground">Herda os responsáveis da família</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Responsáveis</div>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addResp}><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
              </div>
              {resps.map((r, i) => (
                <div key={i} className="rounded-md border border-border p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Responsável {i + 1}</span>
                    {resps.length > 1 && <button type="button" onClick={() => delResp(i)} className="text-muted-foreground hover:text-red-500"><X className="h-3.5 w-3.5" /></button>}
                  </div>
                  <Input placeholder="Nome do responsável *" value={r.nome} onChange={e => setResp(i, { nome: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Telefone *" value={r.telefone} onChange={e => setResp(i, { telefone: e.target.value })} />
                    <Input placeholder="CPF do responsável *" value={r.cpf} onChange={e => setResp(i, { cpf: e.target.value })} />
                  </div>
                  <Select value={r.parentesco} onValueChange={v => setResp(i, { parentesco: v })}>
                    <SelectTrigger><SelectValue placeholder="Parentesco" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mae" disabled={r.parentesco !== 'mae' && resps.some((x, j) => j !== i && x.parentesco === 'mae')}>Mãe{r.parentesco !== 'mae' && resps.some((x, j) => j !== i && x.parentesco === 'mae') ? ' (já tem)' : ''}</SelectItem>
                      <SelectItem value="pai" disabled={r.parentesco !== 'pai' && resps.some((x, j) => j !== i && x.parentesco === 'pai')}>Pai{r.parentesco !== 'pai' && resps.some((x, j) => j !== i && x.parentesco === 'pai') ? ' (já tem)' : ''}</SelectItem>
                      <SelectItem value="padrasto">Padrasto</SelectItem>
                      <SelectItem value="madrasta">Madrasta</SelectItem>
                      <SelectItem value="avo_a">Avô/Avó</SelectItem>
                      <SelectItem value="tio_a">Tio/Tia</SelectItem>
                      <SelectItem value="irmao_a">Irmão/Irmã</SelectItem>
                      <SelectItem value="tutor">Tutor</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {r.foto ? <img src={r.foto} alt="" className="h-full w-full object-cover" /> : <Camera className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCaptura({ tipo: 'resp', i })}>{r.foto ? 'Refazer foto' : 'Tirar foto'}</Button>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" checked={r.autorizado_buscar} onChange={e => setResp(i, { autorizado_buscar: e.target.checked })} />
                      Autorizado a buscar
                    </label>
                  </div>
                </div>
              ))}
              <DispensaCpfInline dispensado={dispensaCpf} onDispensar={() => setDispensaCpf(true)} onCancelar={() => setDispensaCpf(false)} />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={props.onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando} className="bg-pink-600 hover:bg-pink-700">
              {salvando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Cadastrar</>}
            </Button>
          </div>
        </div>
      </DialogContent>
      {captura && (
        <WebcamCaptura
          titulo={captura.tipo === 'crianca' ? 'Foto da criança' : 'Foto do responsável'}
          salvando={false}
          onCapturar={(dataUrl) => { if (captura.tipo === 'crianca') setCri(captura.i, { foto: dataUrl }); else setResp(captura.i, { foto: dataUrl }); setCaptura(null); }}
          onFechar={() => setCaptura(null)}
        />
      )}
    </Dialog>

    {


                                                                                     }
    {familiaSugerida && (
      <Dialog open onOpenChange={(o) => { if (!o) setFamiliaSugerida(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-pink-600" /> É dessa família?
            </DialogTitle>
            <DialogDescription>
              O CPF de <b>{familiaSugerida.membro.nome}</b> já é responsável na{' '}
              <b>{familiaSugerida.familia_nome || 'família cadastrada'}</b>. Confira se é a mesma família antes de juntar.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Filhos já cadastrados</div>
            <ul className="text-sm font-medium space-y-0.5">
              {familiaSugerida.criancas.map((f) => <li key={f.id}>• {f.nome}</li>)}
            </ul>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <Button className="w-full bg-pink-600 hover:bg-pink-700" disabled={salvando}
              onClick={() => { const ref = familiaSugerida.ref_crianca_id; setFamiliaSugerida(null); executarCadastro(ref); }}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Sim, adicionar a esta família
            </Button>
            <Button variant="outline" className="w-full" disabled={salvando}
              onClick={() => { const info = familiaSugerida; setFamiliaSugerida(null); executarCadastro(null, { membroId: info.membro.id, familiaNome: info.familia_nome }); }}>
              Não é a mesma — criar cadastro novo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}

function ModalCadastrarResponsavel(props: {
  open: boolean;
  onClose: () => void;
  criancaId: string;
  criancaNome: string;
  onCadastrado: () => void;
}) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [parentesco, setParentesco] = useState('mae');
  const [salvando, setSalvando] = useState(false);
  const [dispensaCpf, setDispensaCpf] = useState(false);

  useEffect(() => {
    if (props.open) {
      setNome(''); setTelefone(''); setCpf(''); setParentesco('mae'); setDispensaCpf(false);
    }
  }, [props.open]);


  const { tentarFechar } = useConfirmarSaida(!!(nome.trim() || telefone.trim() || cpf.trim()), props.onClose);

  async function salvar() {
    if (!nome.trim()) return toast.error('Nome obrigatório');
    if (!telefone.trim()) return toast.error('Telefone obrigatório');

    if (!dispensaCpf && !cpfValido(cpf)) return toast.error('CPF do responsável é obrigatório. Se não tiver agora, use "Não tenho o CPF agora".');
    setSalvando(true);
    try {
      await totemKids.criancas.addResponsavelRapido(props.criancaId, {
        nome: nome.trim(),
        telefone: telefone.trim(),
        cpf: cpf.trim() || null,
        parentesco,
        permitir_sem_cpf: dispensaCpf || undefined,
      });
      toast.success(`Responsável de ${props.criancaNome} cadastrado`);
      props.onCadastrado();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => { if (!o) tentarFechar(); }}>
      <DialogContent className="max-w-md max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-pink-500" /> Cadastrar responsável
          </DialogTitle>
          <DialogDescription>
            {props.criancaNome} ainda não tem responsável vinculado.
            Cadastre quem está trazendo agora pra deixar o histórico completo · pode fechar e seguir manual se preferir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
          {
                                                                                   }
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Nome do responsável <span className="text-pink-600">*</span></label>
            <Input placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Telefone <span className="text-pink-600">*</span></label>
              <Input placeholder="(21) 90000-0000" value={telefone} onChange={e => setTelefone(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">CPF do responsável <span className="text-pink-600">*</span></label>
              <Input placeholder="000.000.000-00" value={cpf} onChange={e => setCpf(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Parentesco</label>
            <Select value={parentesco} onValueChange={setParentesco}>
            <SelectTrigger><SelectValue placeholder="Parentesco" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mae">Mãe</SelectItem>
              <SelectItem value="pai">Pai</SelectItem>
              <SelectItem value="padrasto">Padrasto</SelectItem>
              <SelectItem value="madrasta">Madrasta</SelectItem>
              <SelectItem value="avo_a">Avô/Avó</SelectItem>
              <SelectItem value="tio_a">Tio/Tia</SelectItem>
              <SelectItem value="irmao_a">Irmão/Irmã</SelectItem>
              <SelectItem value="tutor">Tutor</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
            </Select>
          </div>
          <DispensaCpfInline dispensado={dispensaCpf} onDispensar={() => setDispensaCpf(true)} onCancelar={() => setDispensaCpf(false)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={props.onClose} disabled={salvando}>
              Pular agora
            </Button>
            <Button onClick={salvar} disabled={salvando} className="bg-pink-600 hover:bg-pink-700">
              {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Cadastrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
