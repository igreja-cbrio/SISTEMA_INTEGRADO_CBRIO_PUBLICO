import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '../ui/switch';
import { avaliacao360 } from '../../api';





const GRUPOS = [
  {
    titulo: 'Respostas',
    itens: [
      ['exigir_comentario_avaliadores', 'Exigir comentário dos avaliadores', 'Gestor, pares e liderados só enviam com um comentário em cada pergunta.', 'rascunho'],
      ['exigir_comentario_auto', 'Exigir comentário na autoavaliação', 'A pessoa só envia a própria avaliação comentando cada pergunta.', 'rascunho'],
      ['permitir_edicao', 'Permitir editar a resposta', 'Quem já respondeu pode corrigir enquanto o prazo estiver aberto. Dá para ligar só por um momento, para alguém ajustar, e desligar de novo.'],
      ['respostas_como_opcoes', 'Mostrar as respostas pelos nomes', 'Em vez dos números de 1 a N, a pessoa escolhe entre os nomes da escala (Discordo totalmente, …). Só muda a tela; a nota é a mesma.'],
    ],
  },
  {
    titulo: 'Sigilo',
    itens: [
      ['mostrar_abaixo_do_piso', 'Mostrar a nota de pares e liderados mesmo com menos de 3', 'Com 1 ou 2 pessoas do mesmo tipo dá para saber quem escreveu o quê. Desligado (recomendado), esse grupo só aparece com 3 ou mais respostas.'],
    ],
  },
  {
    titulo: 'O que o gestor vê no resultado dos liderados',
    itens: [
      ['gestor_ve_quadrante', 'Mostrar o quadrante da 9-box', null],
      ['gestor_ve_comentarios', 'Mostrar os comentários', 'Sempre sem o nome de quem escreveu.'],
    ],
  },
  {
    titulo: 'O que a pessoa avaliada vê no próprio resultado',
    itens: [
      ['participante_ve_quadrante', 'Mostrar o quadrante da 9-box', null],
      ['participante_ve_comentarios', 'Mostrar os comentários', 'Sempre sem o nome de quem escreveu.'],
      ['participante_so_nota_final', 'Mostrar só a nota final de cada critério', 'Esconde a nota de cada tipo de avaliador (gestor, pares, liderados).'],
    ],
  },
  {
    titulo: 'Entrega do resultado',
    itens: [
      ['gestor_libera', 'O gestor libera o resultado para o liderado', 'Desligado, só o RH libera.'],
      ['devolutiva', 'Registrar a conversa de devolutiva', 'Marca que o gestor conversou com a pessoa sobre o resultado. Não muda o que a pessoa vê.'],
    ],
  },
];

export default function Configuracoes({ ciclo, onSalvo }) {
  const [cfg, setCfg] = useState(ciclo.config || {});
  const [salvando, setSalvando] = useState(null);
  useEffect(() => { setCfg(ciclo.config || {}); }, [ciclo]);
  const travado = (fase) => ciclo.status === 'encerrado' || (fase === 'rascunho' && ciclo.status !== 'rascunho');

  async function mudar(chave, valor) {
    const antes = cfg;
    setCfg({ ...cfg, [chave]: valor });
    setSalvando(chave);
    try { await avaliacao360.editarCiclo(ciclo.id, { config: { [chave]: valor } }); await onSalvo(); }
    catch (e) { setCfg(antes); toast.error(e.message); } finally { setSalvando(null); }
  }

  return (
    <div className="grid gap-x-10 gap-y-7 md:grid-cols-2">
      {GRUPOS.map((g) => (
        <div key={g.titulo}>
          <p className="mb-2 text-sm font-medium">{g.titulo}</p>
          <ul className="divide-y rounded-xl border">
            {g.itens.map(([chave, nome, dica, fase]) => (
              <li key={chave} className="flex items-start justify-between gap-4 px-4 py-3">
                <span>
                  <span className="block text-sm">{nome}</span>
                  {dica && <span className="block text-xs text-muted-foreground">{dica}</span>}
                  {travado(fase) && fase === 'rascunho' && <span className="block text-[11px] text-muted-foreground">Só muda antes de enviar.</span>}
                </span>
                <Switch checked={!!cfg[chave]} disabled={travado(fase) || salvando === chave}
                  onCheckedChange={(v) => mudar(chave, v)} aria-label={nome} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
