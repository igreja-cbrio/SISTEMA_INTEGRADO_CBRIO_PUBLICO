























function novaKeyCampo() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}





const KEY_CAMPO_OK = /^[a-z0-9_]{1,60}$/;

function keyCampoPreservada(bruta) {
  const k = String(bruta || '');
  return KEY_CAMPO_OK.test(k) ? k : novaKeyCampo();
}

module.exports = { novaKeyCampo, keyCampoPreservada, KEY_CAMPO_OK };
