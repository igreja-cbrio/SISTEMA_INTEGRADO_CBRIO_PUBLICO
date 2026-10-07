














function grupo(pessoa, semana) {
  if (semana == null) return 1;
  const pref = pessoa.rodizio_semana;
  if (pref == null) return 1;
  return Number(pref) === Number(semana) ? 0 : 2;
}

function ordenarPorPreferencia(pessoas, semana) {
  const sem = (semana == null || semana === '') ? null : Number(semana);
  return (pessoas || [])
    .map((p) => ({ ...p, prefere_este_culto: grupo(p, sem) === 0 }))
    .sort((a, b) => (
      grupo(a, sem) - grupo(b, sem)
      || String(a.full_name || '').localeCompare(String(b.full_name || ''), 'pt-BR', { sensitivity: 'base' })
    ));
}

module.exports = { ordenarPorPreferencia };
