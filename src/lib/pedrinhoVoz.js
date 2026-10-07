





import { agents } from '../api';

let audioEl = null;


export function limparTextoParaVoz(t) {
  return (t || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_#>~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


export function pedrinhoParar() {
  try {
    if (audioEl) { audioEl.pause(); audioEl.src = ''; audioEl = null; }
  } catch {              }
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {              }
}

function falarNoNavegador(texto, onStart, onEnd) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) { onEnd && onEnd(); return; }
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR';
    u.rate = 1.03;
    u.pitch = 1.0;
    const vozes = synth.getVoices ? synth.getVoices() : [];
    const ptbr = vozes.find(v => /pt[-_]?BR/i.test(v.lang)) || vozes.find(v => /^pt/i.test(v.lang));
    if (ptbr) u.voice = ptbr;
    u.onstart = () => onStart && onStart();
    u.onend = () => onEnd && onEnd();
    u.onerror = () => onEnd && onEnd();
    synth.cancel();
    synth.speak(u);
  } catch { onEnd && onEnd(); }
}





export async function pedrinhoFalar(texto, { onStart, onEnd } = {}) {
  pedrinhoParar();
  const limpo = limparTextoParaVoz(texto);
  if (!limpo) { onEnd && onEnd(); return; }


  try {
    const blob = await agents.tts(limpo.slice(0, 5000));
    const url = URL.createObjectURL(blob);
    audioEl = new Audio(url);
    audioEl.onplay = () => onStart && onStart();
    audioEl.onended = () => { onEnd && onEnd(); URL.revokeObjectURL(url); };
    audioEl.onerror = () => { URL.revokeObjectURL(url); falarNoNavegador(limpo, onStart, onEnd); };
    await audioEl.play();
    return;
  } catch {

    falarNoNavegador(limpo, onStart, onEnd);
  }
}



export function vozSuportada() {
  return typeof window !== 'undefined' && ('speechSynthesis' in window || 'Audio' in window);
}
