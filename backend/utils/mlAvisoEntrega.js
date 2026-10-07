'use strict';





















const AVISAM = Object.freeze(new Set([
  'shipped',
  'out_for_delivery',
  'delivered',



  'not_delivered',
  'cancelled',
]));


const SILENCIOSOS = Object.freeze(new Set([
  'pending', 'handling', 'ready_to_ship', 'in_transit',
]));










function deveAvisar(status) {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return false;
  if (SILENCIOSOS.has(s)) return false;
  return true;
}

module.exports = { deveAvisar, AVISAM, SILENCIOSOS };
