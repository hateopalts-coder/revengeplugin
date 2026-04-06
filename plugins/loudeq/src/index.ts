// ─────────────────────────────────────────────────────────────────────────────
//  VoiceBoost · index.ts
//  Hooks mic capture and outgoing WebRTC audio track
// ─────────────────────────────────────────────────────────────────────────────

import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import Settings from "./Settings";
import { engine, DEFAULT_SETTINGS, AudioSettings } from "./utils";

// ── Storage init ─────────────────────────────────────────────────────────────
function initStorage(): void {
  const s = storage as any;

  if (!engine.settings) {
    engine.settings = { ...DEFAULT_SETTINGS };
  }

  for (const [key, def] of Object.entries(DEFAULT_SETTINGS) as [keyof AudioSettings, any][]) {
    if (s[key] === undefined) {
      s[key] = def;
    } else {
      (engine.settings as any)[key] = s[key];
    }
  }
}

// ── Hooks ────────────────────────────────────────────────────────────────────
let _origGUM: typeof navigator.mediaDevices.getUserMedia | null = null;
let _origAddTrack: any = null;

function patchGUM(): void {
  if (_origGUM) return;

  try {
    _origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async function (
      constraints: MediaStreamConstraints
    ): Promise<MediaStream> {
      const stream = await _origGUM!(constraints);

      if (constraints?.audio && (engine.settings?.enabled ?? false)) {
        const processed = await engine.attach(stream);
        return processed;
      }

      return stream;
    };

    logger.log("[VoiceBoost] ✓ getUserMedia patched");
  } catch (e) {
    logger.error("[VoiceBoost] getUserMedia patch failed:", e);
  }
}

function patchAddTrack(): void {
  if (_origAddTrack) return;

  try {
    const proto = (globalThis as any).RTCPeerConnection?.prototype;
    if (!proto?.addTrack) return;

    _origAddTrack = proto.addTrack;

    proto.addTrack = function (track: MediaStreamTrack, ...streams: MediaStream[]) {
      try {
        if (track?.kind === "audio" && (engine.settings?.enabled ?? false)) {
          const outTrack = engine.getOutputTrack();
          const outStream = engine.getOutputStream();

          if (outTrack && outStream) {
            track = outTrack;
            if (!streams || streams.length === 0) {
              streams = [outStream];
            } else if (!streams.includes(outStream)) {
              streams = [outStream, ...streams];
            }
          }
        }
      } catch (e) {
        logger.warn("[VoiceBoost] addTrack swap skipped:", e);
      }

      return _origAddTrack.call(this, track, ...streams);
    };

    logger.log("[VoiceBoost] ✓ RTCPeerConnection.addTrack patched");
  } catch (e) {
    logger.error("[VoiceBoost] addTrack patch failed:", e);
  }
}

function unpatchAll(): void {
  try {
    if (_origGUM) {
      navigator.mediaDevices.getUserMedia = _origGUM;
      _origGUM = null;
    }
  } catch (_) {}

  try {
    const proto = (globalThis as any).RTCPeerConnection?.prototype;
    if (_origAddTrack && proto) {
      proto.addTrack = _origAddTrack;
      _origAddTrack = null;
    }
  } catch (_) {}

  engine.destroy();
}

// ── Plugin export ────────────────────────────────────────────────────────────
export default {
  onLoad() {
    initStorage();
    patchGUM();
    patchAddTrack();
    logger.log("[VoiceBoost] Loaded");
  },

  onUnload() {
    unpatchAll();
    logger.log("[VoiceBoost] Unloaded");
  },

  settings: Settings,
};
