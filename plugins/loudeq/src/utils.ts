// ─────────────────────────────────────────────────────────────────────────────
//  VoiceBoost · utils.ts
//  Audio processing engine (Web Audio API chain)
//  Mic → Preamp → Bass EQ → Presence EQ → Overdrive → Gain →
//        Stereo Widener / Mono → DynamicsCompressor → Output
// ─────────────────────────────────────────────────────────────────────────────

export interface AudioSettings {
  enabled: boolean;
  preamp: number;        // 1.0 – 4.0
  bassGain: number;      // -6 to +24 dB
  bassFreq: number;      // 40 – 250 Hz
  presenceGain: number;  // -6 to +12 dB
  overdrive: number;     // 0 – 1
  gain: number;          // 1.0 – 6.0
  stereoWidth: number;   // 0 – 1
  stereoMono: boolean;   // force mono output
  compEnabled: boolean;  // DynamicsCompressor on/off
  compThreshold: number; // -60 to 0 dB
  compRatio: number;     // 1 – 20
}

export const DEFAULT_SETTINGS: AudioSettings = {
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

/** Soft-clipping overdrive curve */
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
  settings: AudioSettings;
  private ctx: AudioContext | null = null;
  private n: Record<string, any> = {};
  private rawStream: MediaStream | null = null;
  private outputStream: MediaStream | null = null;

  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
  }

  private ensureSettings(): AudioSettings {
    if (!this.settings) {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    return this.settings;
  }

  getOutputStream(): MediaStream | null {
    return this.outputStream;
  }

  getOutputTrack(): MediaStreamTrack | null {
    return this.outputStream?.getAudioTracks?.()[0] ?? null;
  }

  /** Attach engine to a live MediaStream. Returns processed stream. */
  async attach(stream: MediaStream): Promise<MediaStream> {
    this.rawStream = stream;
    const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;

    if (!AC) {
      console.warn("[VoiceBoost] AudioContext unavailable — returning raw stream");
      this.outputStream = stream;
      return stream;
    }

    // Close old graph first
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch (_) {
        // ignore
      }
    }

    const ctx = (this.ctx = new AC({ sampleRate: 48000 }));
    const n = (this.n = {});
    const s = this.ensureSettings();

    // Some clients keep audio contexts suspended until user gesture
    try {
      await ctx.resume();
    } catch (_) {
      // ignore
    }

    // ── Nodes ────────────────────────────────────────────────────────────────
    n.src = ctx.createMediaStreamSource(stream);

    n.preamp = ctx.createGain();
    n.preamp.gain.value = s.preamp;

    n.bass = ctx.createBiquadFilter();
    n.bass.type = "lowshelf";
    n.bass.frequency.value = s.bassFreq;
    n.bass.gain.value = s.bassGain;

    n.pres = ctx.createBiquadFilter();
    n.pres.type = "peaking";
    n.pres.frequency.value = 3000;
    n.pres.Q.value = 0.8;
    n.pres.gain.value = s.presenceGain;

    n.dist = ctx.createWaveShaper();
    n.dist.curve = makeOverdriveCurve(s.overdrive);
    n.dist.oversample = "4x";

    n.gain = ctx.createGain();
    n.gain.gain.value = s.gain;

    n.merge = ctx.createChannelMerger(2);
    n.haas = ctx.createDelay(0.05);
    n.haas.delayTime.value = s.stereoMono ? 0 : s.stereoWidth * 0.025;

    n.comp = ctx.createDynamicsCompressor();
    n.comp.threshold.value = s.compThreshold;
    n.comp.knee.value = 8;
    n.comp.ratio.value = s.compRatio;
    n.comp.attack.value = 0.002;
    n.comp.release.value = 0.08;

    n.dest = ctx.createMediaStreamDestination();

    // ── Chain ────────────────────────────────────────────────────────────────
    n.src.connect(n.preamp);
    n.preamp.connect(n.bass);
    n.bass.connect(n.pres);
    n.pres.connect(n.dist);
    n.dist.connect(n.gain);

    // Safer stereo handling:
    // mono mode = duplicate same signal to both channels
    // stereo mode = left dry, right delayed (Haas width)
    if (s.stereoMono) {
      n.gain.connect(n.merge, 0, 0);
      n.gain.connect(n.merge, 0, 1);
    } else {
      n.gain.connect(n.merge, 0, 0);
      n.gain.connect(n.haas);
      n.haas.connect(n.merge, 0, 1);
    }

    if (s.compEnabled) {
      n.merge.connect(n.comp);
      n.comp.connect(n.dest);
    } else {
      n.merge.connect(n.dest);
    }

    this.outputStream = n.dest.stream as MediaStream;

    const outTrack = this.outputStream.getAudioTracks?.()[0];
    if (outTrack) outTrack.enabled = true;

    return this.outputStream;
  }

  /** Live-update a single setting without rebuilding the graph */
  set<K extends keyof AudioSettings>(key: K, val: AudioSettings[K]): void {
    const s = this.ensureSettings();
    s[key] = val;

    if (!this.ctx) return;

    const n = this.n;
    switch (key as string) {
      case "enabled":
        break;
      case "preamp":
        if (n.preamp) n.preamp.gain.value = val as number;
        break;
      case "bassGain":
        if (n.bass) n.bass.gain.value = val as number;
        break;
      case "bassFreq":
        if (n.bass) n.bass.frequency.value = val as number;
        break;
      case "presenceGain":
        if (n.pres) n.pres.gain.value = val as number;
        break;
      case "overdrive":
        if (n.dist) n.dist.curve = makeOverdriveCurve(val as number);
        break;
      case "gain":
        if (n.gain) n.gain.gain.value = val as number;
        break;
      case "stereoWidth":
        if (!this.settings.stereoMono && n.haas) {
          n.haas.delayTime.value = (val as number) * 0.025;
        }
        break;
      case "stereoMono":
        if (n.haas) {
          n.haas.delayTime.value = val ? 0 : this.settings.stereoWidth * 0.025;
        }
        break;
      case "compThreshold":
        if (n.comp) n.comp.threshold.value = val as number;
        break;
      case "compRatio":
        if (n.comp) n.comp.ratio.value = val as number;
        break;
      default:
        break;
    }
  }

  /** Rebuild using the last raw mic stream */
  async refresh(): Promise<MediaStream | null> {
    if (!this.rawStream) return null;
    return this.attach(this.rawStream);
  }

  /** Tear down AudioContext and release all resources */
  async destroy(): Promise<void> {
    try {
      await this.ctx?.close();
    } catch (_) {
      // ignore
    }
    this.ctx = null;
    this.n = {};
    this.rawStream = null;
    this.outputStream = null;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
export const engine = new AudioEngine();
