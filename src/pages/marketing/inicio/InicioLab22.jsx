import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Megaphone } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import SimboloLab22 from './SimboloLab22';
import AvisosInicioDialog from './AvisosInicio';
import ondas from './ondas-lab22.webp';
import {
  ciclosDaSemana, ciclosNaoConferidos, rotinasDaSemana, avisoDaSemana, demandasSemanais,
  nomeDeExibicao, tamanhoDoNome,
} from './reguaInicio';





















const MISSAO = 'Empoderados por Deus para alcançar pessoas para Jesus';

function ddmm(s) {
  return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '';
}

export default function InicioLab22({
  dash, erroDash, linha, carregandoLinha, erroLinha, nome,
  avisos, erroAvisos, onRecarregarAvisos,
}) {
  const ciclos = ciclosDaSemana(dash);
  const cicloFalhou = !!dash?.ciclo?.erro || (!!erroDash && !dash);
  const ciclosConferidos = dash?.ciclo?.rolando_ok === true;
  const naoConferiu = ciclosNaoConferidos(dash);
  const vigentes = avisos?.vigentes || [];
  const agendados = avisos?.agendados || [];
  const podeEditar = !!avisos?.pode_editar;
  const [editandoAvisos, setEditandoAvisos] = useState(false);

  const rotinas = linha ? rotinasDaSemana(linha) : undefined;
  const lider = !!linha?.perfil?.lider;
  const minha = linha?.minha_semana ?? null;
  const aviso = avisoDaSemana(linha ? minha : null);
  const n = demandasSemanais(minha);
  const nomeGrande = nomeDeExibicao(nome);

  let tituloN = 'Demandas desta semana, contando as que ficaram atrasadas';
  if (carregandoLinha && !linha) tituloN = 'Contando…';
  else if (erroLinha) tituloN = `Não deu para contar: ${erroLinha}`;
  else if (linha && !minha) tituloN = 'Você não está na equipe do Marketing, então não há demandas no seu nome';

  return (
    <div className="space-y-5 md:space-y-6">
      {                                                                    }
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] border-b border-border">
        <div className="pb-7 lg:py-8 lg:pr-10 lg:border-r border-border">
          <h2 className="font-heading text-[2.6rem] leading-[0.95] sm:text-6xl xl:text-7xl font-medium tracking-[-0.035em] text-foreground">
            Aviso Importante!
            <span className="block">Sim, Aviso Importante</span>
          </h2>
          {
                                                                        }
          {vigentes.length > 0 && (
            <div className="mt-5 max-w-2xl space-y-3">
              {vigentes.map(a => (
                <p key={a.id} className="text-base md:text-lg leading-relaxed text-foreground whitespace-pre-line break-words">
                  {a.texto}
                </p>
              ))}
            </div>
          )}
          <p className={`${vigentes.length ? 'mt-4' : 'mt-5'} max-w-2xl text-sm md:text-[15px] leading-relaxed text-muted-foreground`}>
            {aviso.map((p, i) => (p.n != null


              ? <b key={i} className={`font-semibold tabular-nums text-foreground ${p.forte ? 'underline decoration-2 underline-offset-4 decoration-[hsl(var(--lab-laranja,22_98%_49%))]' : ''}`}>{p.n}</b>
              : <span key={i}>{p.t}</span>))}
          </p>
          {                                                                        }
          {erroAvisos && (
            <p className="mt-3 text-xs text-muted-foreground" role="status">
              Os avisos do líder não carregaram ({erroAvisos}).{' '}
              <button type="button" onClick={onRecarregarAvisos} className="underline font-medium">Tentar de novo</button>
            </p>
          )}
          {avisos?.lider_conferido === false && (
            <p className="mt-3 text-xs text-muted-foreground" role="status">
              Não deu para conferir agora se você publica avisos. Recarregue a página para tentar de novo.
            </p>
          )}
          {podeEditar && (
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditandoAvisos(true)}>
                <Megaphone aria-hidden="true" /> Adicionar aviso
              </Button>
              {avisos?.disponivel === false ? (
                <span className="text-xs text-muted-foreground">Ainda indisponível: falta aplicar a migration dos avisos.</span>
              ) : (vigentes.length > 0 || agendados.length > 0) && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {[
                    vigentes.length ? `${vigentes.length} no ar` : null,
                    agendados.length ? `${agendados.length} ${agendados.length === 1 ? 'agendado' : 'agendados'}` : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          )}
          {editandoAvisos && (
            <AvisosInicioDialog
              dados={avisos}
              onClose={() => setEditandoAvisos(false)}
              onMudou={onRecarregarAvisos}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-7 sm:gap-0 py-7 lg:py-8 lg:pl-10 border-t lg:border-t-0 border-border">
          <ListaCurta titulo="Ciclos" className="sm:pr-6 sm:border-r sm:border-dashed sm:border-border">
            {cicloFalhou ? (
              <Vazio>O ciclo criativo não carregou.</Vazio>
            ) : !dash ? (
              <Vazio>Carregando…</Vazio>
            ) : ciclos.length === 0 ? (
              <Vazio>{ciclosConferidos ? 'Nenhum ciclo com tarefa rolando nesta semana.' : 'Nenhum ciclo com fase nesta semana.'}</Vazio>
            ) : ciclos.map(c => (
              <Item
                key={c.id}
                title={`${c.nome} · ${c.numero_fase != null ? `F${c.numero_fase} ` : ''}${c.fase}${c.dia_d ? ` · Dia D ${ddmm(c.dia_d)}` : ''}${c.proxima ? ` · depois: ${c.proxima}` : ''}${c.abertas != null ? ` · ${c.abertas} ${c.abertas === 1 ? 'tarefa aberta' : 'tarefas abertas'}` : ''}`}
              >
                {c.nome} - {c.fase}
              </Item>
            ))}
            {                                                                     }
            {naoConferiu && !cicloFalhou && (
              <Vazio>Não deu para conferir as tarefas abertas: a lista mostra todo ciclo com fase nesta semana.</Vazio>
            )}
          </ListaCurta>

          <ListaCurta titulo="Rotinas" className="sm:pl-6">
            {rotinas === undefined ? (
              <Vazio>{erroLinha ? 'A rotina não carregou.' : 'Carregando…'}</Vazio>
            ) : rotinas === null ? (
              <Vazio>A rotina não carregou.</Vazio>
            ) : rotinas.length === 0 ? (
              <Vazio>
                Nenhuma rotina nesta semana.
                {lider && ' Cadastre em Demandas → Configurar → Rotina.'}
              </Vazio>
            ) : rotinas.map(r => (


              <Item key={`${r.dia}-${r.textos[0]}`} title={`${r.rotulo}: ${r.textos.join(' · ')}`}>
                {r.rotulo} - {r.textos.join(' · ')}
              </Item>
            ))}
          </ListaCurta>
        </div>
      </section>

      {                                                           }
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)] gap-4">
        <div className="rounded-xl overflow-hidden bg-[hsl(var(--lab-azul,243_98%_49%))] text-white">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/25 border-b border-white/25">
            <p className="font-heading px-6 py-5 text-sm leading-tight uppercase font-medium tracking-[0.01em]">
              Seja muito<br className="hidden sm:inline" /> bem-vindo(a)!
            </p>
            <div className="px-6 py-4 flex items-center gap-3" title={tituloN}>
              <span className="font-heading text-5xl md:text-6xl leading-none font-medium tabular-nums tracking-[-0.03em]" aria-live="polite">
                {carregandoLinha && !linha ? '…' : n == null ? '—' : n}
              </span>
              <span className="font-heading text-sm leading-tight uppercase font-medium">
                {n === 1 ? 'Demanda' : 'Demandas'}<br />semanais
              </span>
            </div>
            <p className="font-heading px-6 py-5 text-sm leading-tight uppercase font-medium">
              {MISSAO}
            </p>
          </div>
          {

                                                                  }
          <div className="px-6 md:px-10 pt-8 pb-9 md:pt-10 md:pb-12" style={{ containerType: 'inline-size' }}>
            <p
              className="font-heading uppercase font-medium leading-[0.86] tracking-[-0.045em] text-[clamp(2.75rem,7.2vw,8rem)] break-words"
              style={{ fontSize: tamanhoDoNome(nomeGrande || 'Boas-vindas') || undefined }}
            >
              {nomeGrande || 'Boas-vindas'}
            </p>
          </div>
        </div>

        <Link
          to="/marketing/demandas"
          className="group relative block min-h-[15rem] rounded-xl overflow-hidden bg-neutral-700 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Acesse aqui suas demandas"
        >
          <img src={ondas} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-black/10" aria-hidden="true" />
          <SimboloLab22 className="absolute left-6 top-6 w-24 text-white drop-shadow" />
          <span className="absolute left-6 right-6 bottom-6 flex items-end justify-between gap-3">
            <span className="font-heading text-[1.7rem] md:text-3xl leading-[0.95] uppercase font-medium tracking-[-0.02em]">
              Acesse aqui<br />suas demandas
            </span>
            <ArrowUpRight className="h-6 w-6 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>
      </section>
    </div>
  );
}

function ListaCurta({ titulo, className = '', children }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <h3 className="font-heading text-[13px] font-semibold uppercase tracking-[0.04em] text-foreground mb-2">{titulo}</h3>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function Item({ title, children }) {
  return (


    <li className="text-[13px] uppercase tracking-[0.01em] text-muted-foreground leading-5 break-words [text-wrap:pretty]" title={title}>
      {children}
    </li>
  );
}

function Vazio({ children }) {
  return <li className="text-[13px] text-muted-foreground leading-5">{children}</li>;
}
