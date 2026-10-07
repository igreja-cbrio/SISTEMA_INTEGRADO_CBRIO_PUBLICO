












import { C } from './comum';

export const LEGENDA = [
  { chave: 'rotina_staff', rotulo: 'Rotina Staff', cor: '#B4C7E7' },
  { chave: 'rotina_liturgia', rotulo: 'Rotina de Liturgia', cor: '#6F88BA' },
  { chave: 'feriado', rotulo: 'Feriado', cor: '#FFC000' },
  { chave: 'evento_especial', rotulo: 'Evento especial', cor: '#A9D18E' },
  { chave: 'geracional', rotulo: 'Geracional', cor: '#EFC1DC' },
  { chave: 'aniversarios', rotulo: 'Aniversários', cor: '#ED7D31' },
  { chave: 'grupos', rotulo: 'Grupos', cor: '#FFFFFF' },
];

export const COR_LEGENDA = Object.fromEntries(LEGENDA.map((l) => [l.chave, l.cor]));

const CATEGORIA_POR_NATUREZA = {
  rotina: 'rotina_staff',
  liturgico: 'rotina_liturgia',
  culto: 'rotina_liturgia',
  feriado: 'feriado',
};
const CATEGORIA_POR_AREA = { kids: 'geracional', ami: 'geracional', grupos: 'grupos' };


export function categoriaDe(item) {
  if (item?.categoria && COR_LEGENDA[item.categoria]) return item.categoria;
  if (CATEGORIA_POR_NATUREZA[item?.natureza]) return CATEGORIA_POR_NATUREZA[item.natureza];
  return CATEGORIA_POR_AREA[item?.area] || 'evento_especial';
}

export function corDe(item) {
  return COR_LEGENDA[categoriaDe(item)];
}


export const TEXTO_SOBRE_LEGENDA = '#1f2937';


export function estiloChip(item) {
  const chave = categoriaDe(item);
  return {
    background: COR_LEGENDA[chave], color: TEXTO_SOBRE_LEGENDA,
    ...(chave === 'grupos' ? { border: `1px solid ${COR_LEGENDA.rotina_liturgia}` } : {}),
  };
}

export default function LegendaCalendario() {
  return (
    <div style={{ display: 'flex', gap: '6px 18px', flexWrap: 'wrap', fontSize: 12, color: C.t2 }}>
      {LEGENDA.map((l) => (
        <span key={l.chave} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: l.cor, ...(l.chave === 'grupos' ? { border: `1px solid ${COR_LEGENDA.rotina_liturgia}`, boxSizing: 'border-box' } : {}) }} />
          {l.rotulo}
        </span>
      ))}
    </div>
  );
}
