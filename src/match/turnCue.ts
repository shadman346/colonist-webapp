const SOUND_KEY = "colonist-turn-sound";
let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  audioContext ??= new AudioContext();
  return audioContext;
}

export function turnSoundEnabled(): boolean {
  return typeof window === "undefined" || window.localStorage.getItem(SOUND_KEY) !== "off";
}

export function setTurnSoundEnabled(enabled: boolean): void {
  window.localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  if (enabled) void context()?.resume().catch(() => undefined);
}

export function playTurnSound(): void {
  if (!turnSoundEnabled()) return;
  const audio = context();
  if (!audio) return;
  void audio.resume().then(() => {
    const start = audio.currentTime + 0.02;
    for (const [offset, frequency] of [[0, 659.25], [0.16, 880]] as const) {
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      volume.gain.setValueAtTime(0.0001, start + offset);
      volume.gain.exponentialRampToValueAtTime(0.065, start + offset + 0.025);
      volume.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.34);
      tone.connect(volume).connect(audio.destination);
      tone.start(start + offset);
      tone.stop(start + offset + 0.35);
    }
  }).catch(() => undefined);
}

// The first normal game interaction unlocks audio for later remote turn changes.
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => {
    void context()?.resume().catch(() => undefined);
  }, { once: true, capture: true });
}
