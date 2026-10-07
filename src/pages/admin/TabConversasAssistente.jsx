







import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { assistenteConversas } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

const PERIODOS = [
  { dias: 30, rotulo: 'Últimos 30 dias' },
  { dias: 90, rotulo: 'Últimos 90 dias' },
  { dias: 365, rotulo: 'Últimos 12 meses' },
];

const ROTULO_TIPO = {
  como_fazer: 'Como fazer',
  onde_fica: 'Onde fica',
  erro_sistema: 'Erro no sistema',
  permissao: 'Permissão',
  sugestao: 'Sugestão',
  fora_do_escopo: 'Fora do escopo',
  outro: 'Outro',
};

function diaBrt(data) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data);
}

function inicioDoPeriodo(dias) {
  return diaBrt(new Date(Date.now() - dias * 24 * 3600 * 1000));
}

function Numero({ rotulo, valor, destaque }) {
  return (
    <div className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--cbrio-border)' }}>
      <div className="text-xs" style={{ color: 'var(--cbrio-text3)' }}>{rotulo}</div>
      <div className="text-2xl font-bold" style={{ color: destaque ? '#d97706' : 'var(--cbrio-text)' }}>{valor}</div>
    </div>
  );
}

export default function TabConversasAssistente() {
  const [dias, setDias] = useState(90);
  const inicio = inicioDoPeriodo(dias);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['assistente-conversas', 'temas', inicio],
    queryFn: () => assistenteConversas.temas({ inicio }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <Button key={p.dias} size="sm" variant={dias === p.dias ? 'default' : 'outline'} onClick={() => setDias(p.dias)}>
            {p.rotulo}
          </Button>
        ))}
        <span className="text-xs" style={{ color: 'var(--cbrio-text3)' }}>
          Conversas do assistente em vídeo. Sem transcrição e sem identificar quem perguntou.
        </span>
      </div>

      {isLoading && <p className="text-sm" style={{ color: 'var(--cbrio-text3)' }}>Carregando…</p>}

      {isError && (
        <Card>
          <CardContent className="py-4 text-sm">
            <p style={{ color: '#ef4444' }}>Não foi possível carregar os temas: {error?.message || 'erro desconhecido'}.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>Tentar de novo</Button>
          </CardContent>
        </Card>
      )}

      {data && data.totais.conversas === 0 && (
        <Card>
          <CardContent className="py-6 text-sm" style={{ color: 'var(--cbrio-text2)' }}>
            Nenhuma conversa registrada neste período. O assistente em vídeo está em piloto com os super-admins;
            os temas aparecem aqui depois das primeiras conversas.
          </CardContent>
        </Card>
      )}

      {data && data.totais.conversas > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Numero rotulo="Conversas" valor={data.totais.conversas} />
            <Numero rotulo="Classificadas" valor={data.totais.classificadas} />
            <Numero rotulo="Não resolvidas" valor={data.totais.nao_resolvidas} destaque={data.totais.nao_resolvidas > 0} />
            <Numero rotulo="Descartadas (assunto sensível)" valor={data.totais.descartadas_sensiveis} />
            <Numero rotulo="Sem classificação (erro)" valor={data.totais.com_erro} destaque={data.totais.com_erro > 0} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Temas mais perguntados</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: 'var(--cbrio-text3)' }}>
                      <th className="py-1 text-left font-medium">Tema</th>
                      <th className="py-1 text-right font-medium">Conversas</th>
                      <th className="py-1 text-right font-medium">Não resolvidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.por_tema.map((t) => (
                      <tr key={t.tema} className="border-t" style={{ borderColor: 'var(--cbrio-border)' }}>
                        <td className="py-1.5">{t.rotulo}</td>
                        <td className="py-1.5 text-right">{t.total}</td>
                        <td className="py-1.5 text-right" style={{ color: t.nao_resolvidas ? '#d97706' : undefined }}>
                          {t.nao_resolvidas} ({Math.round((t.nao_resolvidas / t.total) * 100)}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Telas onde as dúvidas aparecem</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.por_tela.map((t) => (
                  <div key={t.chave} className="flex justify-between border-t py-1.5" style={{ borderColor: 'var(--cbrio-border)' }}>
                    <span>{t.chave}</span><span>{t.total}</span>
                  </div>
                ))}
                <div className="pt-3 text-xs" style={{ color: 'var(--cbrio-text3)' }}>
                  Por tipo: {data.por_tipo.map((t) => `${ROTULO_TIPO[t.chave] || t.chave} (${t.total})`).join(' · ')}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Dúvidas que o assistente não resolveu</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {data.lacunas.length === 0 ? (
                <p style={{ color: 'var(--cbrio-text3)' }}>Nenhuma dúvida sem resposta neste período.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.lacunas.map((l, i) => (
                    <li key={`${l.dia}-${i}`} className="border-t pt-1.5" style={{ borderColor: 'var(--cbrio-border)' }}>
                      <span style={{ color: 'var(--cbrio-text3)' }}>{l.dia} · {l.tema} · {l.resolvido === 'parcial' ? 'parcial' : 'não resolvida'}</span>
                      <div>{l.resumo}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
