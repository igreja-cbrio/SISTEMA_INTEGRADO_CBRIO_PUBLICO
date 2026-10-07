











const MIGRATION_AREA_TAREFA = '20261001200000';
const ehColunaAusente = (e) => !!e && (e.code === '42703' || e.code === 'PGRST204');




async function lerAreasDasTarefas(db) {
  const areas = {};
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('marketing_kanban_cards').select('id, area')
      .not('area', 'is', null).is('deleted_at', null).order('id').range(de, de + 999);
    if (error) {
      if (ehColunaAusente(error)) return { areas: {}, ausente: true };
      throw error;
    }
    for (const r of data || []) areas[r.id] = r.area;
    if (!data || data.length < 1000) return { areas, ausente: false };
  }
}



async function anotarAreaDasTarefas(cards, db) {
  const { areas, ausente } = await lerAreasDasTarefas(db);
  for (const c of cards || []) if (c) c.area = areas[c.id] || null;
  return ausente
    ? `O quadro Redes · Produção ainda não separa tarefas: falta aplicar a migration ${MIGRATION_AREA_TAREFA}.`
    : null;
}

module.exports = { MIGRATION_AREA_TAREFA, ehColunaAusente, lerAreasDasTarefas, anotarAreaDasTarefas };
