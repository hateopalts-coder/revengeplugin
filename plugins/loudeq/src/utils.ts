// ─────────────────────────────────────────────────────────────────────────────
//  VoiceBoost · utils.ts
//  Audio processing engine (Web Audio API chain)
//  Chain: Mic → Preamp → Bass EQ → Presence EQ → Overdrive → Gain →
//         Stereo Widener (Haas) → DynamicsCompressor → Output
// ─────────────────────────────────────────────────────────────────────────────

export interface AudioSettings {
  enabled: boolean;
  preamp: number;        // 1.0 – 4.0  (input amplification before chain)
  bassGain: number;      // -6 to +24 dB  (low shelf EQ)
  bassFreq: number;      // 40 – 250 Hz   (low shelf frequency)
  presenceGain: number;  // -6 to +12 dB  (peaking EQ @ 3 kHz for clarity)
  overdrive: number;     // 0 – 1         (WaveShaper distortion amount)
  gain: number;          // 1.0 – 6.0     (output gain multiplier)
  stereoWidth: number;   // 0 – 1         (Haas delay width)
  stereoMono: boolean;   // force mono output
  compEnabled: boolean;  // DynamicsCompressor on/off
  compThreshold: number; // -60 to 0 dB
  compRatio: number;     // 1 – 20
}

export const DEFAULT_SETTINGS: AudioSettings = {
  // FIX: was `false` — plugin never processed the stream on first install
  enabled: true,
  preamp: 1.8,
  bassGain: 8,
  bassFreq: 80,
  presenceGain: 4,
  overdrive: 0.15,
  gain: 2.5,
  stereoWidth: 0.6,
  stereoMono: false,
  compEnabled: true,
  compThreshold: -20,
  compRatio: 6,
};

/** Soft-clipping overdrive curve (musical distortion, not harsh) */
function makeOverdriveCurve(amount: number): Float32Array {
  const n = 256;
  const curve = new Float32Array(n);
  const K = amount * 300;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = K > 0
      ? ((Math.PI + K) * x) / (Math.PI + K * Math.abs(x))
      : x;
  }
  return curve;
}

export class AudioEngine {
  settings: AudioSettings = { ...DEFAULT_SETTINGS };

  private ctx: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private n: Record<string, any> = {};

  /** Attach engine to a live MediaStream. Returns processed stream. */
  async attach(stream: MediaStream): Promise<MediaStream> {
    const AC =
      (window as any).AudioContext ??
      (window as any).webkitAudioContext;
    if (!AC) {
      console.warn("[VoiceBoost] AudioContext unavailable — returning raw stream");
      return stream;
    }

    // Clean up previous context
    if (this.ctx) {
      try { await this.ctx.close(); } catch (_) { /* ignore */ }
    }

    const ctx = (this.ctx = new AC({ sampleRate: 48000 }));
    const n = (this.n = {} as Record<string, any>);
    const s = this.settings;

    // ── Nodes ────────────────────────────────────────────────────────────────
    n.src    = ctx.createMediaStreamSource(stream);

    // Preamp gain
    n.preamp = ctx.createGain();
    n.preamp.gain.value = s.preamp;

    // Bass low-shelf EQ
    n.bass = ctx.createBiquadFilter();
    n.bass.type = "lowshelf";
    n.bass.frequency.value = s.bassFreq;
    n.bass.gain.value = s.bassGain;

    // Presence peaking EQ @ 3 kHz (adds vocal clarity)
    n.pres = ctx.createBiquadFilter();
    n.pres.type = "peaking";
    n.pres.frequency.value = 3000;
    n.pres.Q.value = 0.8;
    n.pres.gain.value = s.presenceGain;

    // Overdrive / distortion
    n.dist = ctx.createWaveShaper();
    n.dist.curve = makeOverdriveCurve(s.overdrive);
    n.dist.oversample = "4x";

    // Main output gain
    n.gain = ctx.createGain();
    n.gain.gain.value = s.gain;

    // Stereo widener (Haas effect: tiny delay on right channel)
    n.split = ctx.createChannelSplitter(2);
    n.merge = ctx.createChannelMerger(2);
    n.haas  = ctx.createDelay(0.05);
    n.haas.delayTime.value = s.stereoMono ? 0 : s.stereoWidth * 0.025;

    // Dynamics compressor (loudness maximizer)
    n.comp = ctx.createDynamicsCompressor();
    n.comp.threshold.value = s.compThreshold;
    n.comp.knee.value      = 8;
    n.comp.ratio.value     = s.compRatio;
    n.comp.attack.value    = 0.002;
    n.comp.release.value   = 0.08;

    // Output destination (gives us a clean MediaStream)
    n.dest = ctx.createMediaStreamDestination();

    // ── Chain ────────────────────────────────────────────────────────────────
    n.src.connect(n.preamp);
    n.preamp.connect(n.bass);
    n.bass.connect(n.pres);
    n.pres.connect(n.dist);
    n.dist.connect(n.gain);
    n.gain.connect(n.split);

    if (s.stereoMono) {
      // Sum L+R → both channels (mono)
      n.split.connect(n.merge, 0, 0);
      n.split.connect(n.merge, 0, 1);
    } else {
      // L: direct pass-through
      n.split.connect(n.merge, 0, 0);
      // R: Haas delay for stereo widening
      n.split.connect(n.haas, 1);
      n.haas.connect(n.merge, 0, 1);
    }

    // Compressor in/out
    if (s.compEnabled) {
      n.merge.connect(n.comp);
      n.comp.connect(n.dest);
    } else {
      n.merge.connect(n.dest);
    }

    return n.dest.stream as MediaStream;
  }

  /** Live-update a single setting without rebuilding the graph */
  set<K extends keyof AudioSettings>(key: K, val: AudioSettings[K]): void {
    this.settings[key] = val;
    if (!this.ctx) return;
    const n = this.n;

    switch (key as string) {
      case "enabled":
        // FIX: no live graph change possible for enabled toggle —
        // user must rejoin VC. Just update settings (done above). No-op here.
        break;
      case "preamp":         n.preamp.gain.value        = val; break;
      case "bassGain":       n.bass.gain.value          = val; break;
      case "bassFreq":       n.bass.frequency.value     = val; break;
      case "presenceGain":   n.pres.gain.value          = val; break;
      case "overdrive":      n.dist.curve = makeOverdriveCurve(val as number); break;
      case "gain":           n.gain.gain.value          = val; break;
      case "stereoWidth":
        if (!this.settings.stereoMono)
          n.haas.delayTime.value = (val as number) * 0.025;
        break;
      case "stereoMono":
        n.haas.delayTime.value = val ? 0 : this.settings.stereoWidth * 0.025;
        break;
      case "compThreshold":  n.comp.threshold.value     = val; break;
      case "compRatio":      n.comp.ratio.value         = val; break;
      // compEnabled change requires stream rebuild (user must rejoin VC)
      default: break;
    }
  }

  /** Tear down AudioContext and release all resources */
  async destroy(): Promise<void> {
    try { await this.ctx?.close(); } catch (_) { /* ignore */ }
    this.ctx = null;
    this.n   = {};
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
// Both index.ts and Settings.tsx import this same instance
export const engine = new AudioEngine();
