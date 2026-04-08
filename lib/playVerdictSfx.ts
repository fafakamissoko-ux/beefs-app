/**
 * Court bruitage « tension électrique / tonnerre » via Web Audio (aucun fichier externe).
 * Appeler après un geste utilisateur pour respecter les politiques navigateur.
 */
export function playRematchThunderSfx(): void {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new AudioContext();
    const dur = 0.45;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    const nBuf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = nBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-3 * (i / data.length));
    }
    noise.buffer = nBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.01, now + dur);

    noise.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + dur);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.35);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(0.12, now + 0.06);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(g2);
    g2.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.42);

    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* autoplay / context */
  }
}
