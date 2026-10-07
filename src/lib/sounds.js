
let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}


export function playNotificationSound() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;


    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.connect(g1);
    g1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, t);
    g1.gain.setValueAtTime(0.4, t);
    g1.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    osc1.start(t);
    osc1.stop(t + 0.25);


    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.connect(g2);
    g2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1175, t + 0.18);
    g2.gain.setValueAtTime(0, t);
    g2.gain.setValueAtTime(0.4, t + 0.18);
    g2.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    osc2.start(t + 0.18);
    osc2.stop(t + 0.5);
  } catch {                           }
}



export function playMessageSound() {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const notas = [[523.25, 0], [783.99, 0.085]];
    for (const [freq, delay] of notas) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + delay);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(0.32, t + delay + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.17);
      osc.start(t + delay);
      osc.stop(t + delay + 0.2);
    }
  } catch {                           }
}


export function playCheckinSound() {
  try {
    const ctx = getCtx();



    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;


    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';

    osc.frequency.setValueAtTime(1568, t);
    osc.frequency.exponentialRampToValueAtTime(2093, t + 0.08);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.start(t);
    osc.stop(t + 0.5);
  } catch {                           }
}


export function playSuccessSound() {
  try {
    const ctx = getCtx();
    const notes = [523, 659, 784];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.35);

      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.35);
    });
  } catch {                           }
}
