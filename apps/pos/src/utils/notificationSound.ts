// Marketplace-order arrival sound.
//
// We deliberately generate a short sine-wave chirp via WebAudio so the app has
// zero asset dependencies. On native targets where AudioContext is unavailable
// the function silently no-ops. The function is throttled by the caller
// (notificationStore.lastSoundAt).
//
// If we later want a richer sound (mp3), only the body of `playNewOrderSound`
// changes — the public signature stays identical.

import { logger } from './logger';

let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const Ctor =
    (window as any).AudioContext ||
    (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (!audioCtx) audioCtx = new Ctor();
    return audioCtx;
  } catch (err) {
    logger.warn('notificationSound.context', (err as Error).message);
    return null;
  }
};

export const playNewOrderSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    // Some browsers suspend the context until the first user gesture; resume()
    // is safe to call even when already running.
    if (ctx.state === 'suspended') void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    osc.start(now);
    osc.stop(now + 0.5);
  } catch (err) {
    logger.warn('notificationSound.play', (err as Error).message);
  }
};
