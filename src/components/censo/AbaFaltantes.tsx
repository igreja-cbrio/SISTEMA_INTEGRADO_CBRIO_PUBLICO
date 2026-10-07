












import VoluntariosSemCenso from './VoluntariosSemCenso';
import GruposSemCenso from './GruposSemCenso';
import EmptyState from '@/components/EmptyState';
import { UserX } from 'lucide-react';

export default function AbaFaltantes({ pesquisaId, nivel }: { pesquisaId: string | null; nivel: number }) {
  if (!pesquisaId) {
    return <EmptyState icon={UserX} titulo="Nenhuma pesquisa selecionada"
      mensagem="Selecione a pesquisa acima para ver quem ainda não preencheu." />;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Quem ainda não tem resposta concluída nesta pesquisa, em dois recortes: os <strong>voluntários</strong>,
        por área e equipe, e as <strong>pessoas em grupo de conexão</strong>, por grupo e com o líder ao lado.
        A mesma pessoa pode aparecer nos dois — é a mesma falta, vista por dois caminhos de cobrança.
      </p>
      <VoluntariosSemCenso pesquisaId={pesquisaId} nivel={nivel} />
      <GruposSemCenso pesquisaId={pesquisaId} nivel={nivel} />
    </div>
  );
}
