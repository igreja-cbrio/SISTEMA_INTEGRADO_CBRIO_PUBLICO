import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { AbaMembros, AbaRecorrentes, AbaOverrides, AbaPadroes, AbaEtiquetas } from './MarketingAdmin';




export const ABAS_CONFIGURAR = [
  { key: 'equipe', rotulo: 'Equipe' },
  { key: 'rotina', rotulo: 'Rotina' },
  { key: 'folgas', rotulo: 'Férias e folgas' },
  { key: 'matriz', rotulo: 'Matriz do ciclo' },
  { key: 'tipos', rotulo: 'Tipos de entrega' },
];



export const abaValida = (k) => (ABAS_CONFIGURAR.some(a => a.key === k) ? k : ABAS_CONFIGURAR[0].key);

export default function ConfigurarMarketing({ aba, onAba, onClose, areaRotina = null }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Configurar o Marketing</DialogTitle>
          <DialogDescription>
            Equipe, rotina, férias, matriz do ciclo criativo e tipos de entrega. Ao fechar, as Demandas se atualizam.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={abaValida(aba)} onValueChange={onAba} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            {ABAS_CONFIGURAR.map(a => <TabsTrigger key={a.key} value={a.key}>{a.rotulo}</TabsTrigger>)}
          </TabsList>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <TabsContent value="equipe" className="mt-0"><AbaMembros /></TabsContent>
            <TabsContent value="rotina" className="mt-0"><AbaRecorrentes areaInicial={areaRotina} /></TabsContent>
            <TabsContent value="folgas" className="mt-0"><AbaOverrides /></TabsContent>
            <TabsContent value="matriz" className="mt-0"><AbaPadroes /></TabsContent>
            <TabsContent value="tipos" className="mt-0"><AbaEtiquetas /></TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
