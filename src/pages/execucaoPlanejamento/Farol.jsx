

import { C } from '../planejamentoAnual/comum';

export const FAROL = {
  verde: { rotulo: 'Em dia', cor: C.green },
  amarelo: { rotulo: 'Atenção', cor: C.amber },
  vermelho: { rotulo: 'Em risco', cor: C.red },
};

export default function Farol({ saude, compacto = false }) {
  const f = FAROL[saude?.farol];
  if (!f) return <span style={{ color: C.t3, fontSize: 12 }}>—</span>;
  const motivos = (saude.motivos || []).join('\n');
  return (
    <span
      title={motivos || f.rotulo}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: f.cor, whiteSpace: 'nowrap' }}
    >
      <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: f.cor }} />
      {!compacto && f.rotulo}
    </span>
  );
}
