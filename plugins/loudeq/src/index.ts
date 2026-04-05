// ─────────────────────────────────────────────────────────────────────────────
//  VoiceBoost · index.ts
//  - Patches navigator.mediaDevices.getUserMedia to intercept mic streams
//  - FloatingBoostPanel rendered inside Settings.tsx (no root injection)
//    Root injection removed: caused circular dep crash in Revenge bundler —
//    FloatingBoostPanel resolved as undefined at patch fire time, making
//    React.createElement receive a falsy component → crash.
// ─────────────────────────────────────────────────────────────────────────────

import { storage }  from "@vendetta/plugin";
import { logger }   from "@vendetta";
import Settings     from "./Settings";
import { engine, DEFAULT_SETTINGS, AudioSettings } from "./utils";

// ── Storage init ─────────────────────────────────────────────────────────────
function initStorage(): void {
  const s = storage as any;
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS) as [keyof AudioSettings, any][]) {
    if (s[key] === undefined) {
      s[key] = def;
    } else {
      (engine.settings as any)[key] = s[key];
    }
  }
}

// ── getUserMedia patch ────────────────────────────────────────────────────────
let _origGUM: typeof navigator.mediaDevices.getUserMedia | null = null;

function patchGUM(): void {
  if (_origGUM) return;
  try {
    _origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (
      constraints: MediaStreamConstraints
    ): Promise<MediaStream> {
      const stream = await _origGUM!(constraints);
      if (constraints?.audio && engine.settings.enabled) {
        return engine.attach(stream);
      }
      return stream;
    };
    logger.log("[VoiceBoost] ✓ getUserMedia patched");
  } catch (e) {
    logger.error("[VoiceBoost] getUserMedia patch failed:", e);
  }
}

function unpatchGUM(): void {
  if (_origGUM) {
    navigator.mediaDevices.getUserMedia = _origGUM;
    _origGUM = null;
    logger.log("[VoiceBoost] getUserMedia restored");
  }
  engine.destroy();
}

// ── Plugin export ─────────────────────────────────────────────────────────────
export default {
  onLoad() {
    initStorage();
    patchGUM();
    logger.log("[VoiceBoost] Loaded");
  },

  onUnload() {
    unpatchGUM();
    logger.log("[VoiceBoost] Unloaded");
  },

  settings: Settings,
};
