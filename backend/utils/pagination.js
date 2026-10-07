










async function fetchAllRows(build, { page = 1000, max = Infinity } = {}) {
  const out = [];
  for (;;) {
    const restante = max - out.length;
    if (restante <= 0) break;
    const size = Math.min(page, restante);

    const { data, error } = await build().range(out.length, out.length + size - 1);
    if (error) break;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

module.exports = { fetchAllRows };
