// ─────────────────────────────────────────────────────────────────────────────
//  VoiceBoost · index.ts
//  - Patches navigator.mediaDevices.getUserMedia to intercept mic streams
//  - Tries to inject FloatingBoostPanel into Discord's root component
//    so the panel persists even after leaving Settings
// ─────────────────────────────────────────────────────────────────────────────

import { findByName, findByProps } from "@vendetta/metro";
import { React }                   from "@vendetta/metro/common";
import { after }                   from "@vendetta/patcher";
import { storage }                 from "@vendetta/plugin";
import { logger }                  from "@vendetta";
import Settings                    from "./Settings";
// FIX: was using runtime require("./Settings") inside the patch callback —
// Revenge's bundler resolves this as undefined due to circular dep timing,
// causing "Component is falsy" crash. Import at top level instead.
import { FloatingBoostPanel }      from "./Settings";
import { engine, DEFAULT_SETTINGS, AudioSettings } from "./utils";

// ── Storage init ─────────────────────────────────────────────────────────────
function initStorage(): void {
  const s = storage as any;
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS) as [keyof AudioSettings, any][]) {
    if (s[key] === undefined) {
      s[key] = def;
    } else {
      // Rehydrate engine with saved values
      (engine.settings as any)[key] = s[key];
    }
  }
}

// ── getUserMedia patch ────────────────────────────────────────────────────────
let _origGUM: typeof navigator.mediaDevices.getUserMedia | null = null;

function patchGUM(): void {
  if (_origGUM) return; // already patched
  try {
    _origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (
      constraints: MediaStreamConstraints
    ): Promise<MediaStream> {
      const stream = await _origGUM!(constraints);
      // Only process audio streams when processing is enabled
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

// ── Root panel injection ──────────────────────────────────────────────────────
// Tries multiple common component names across Revenge / Bunny / Vendetta versions.
// If found, injects <FloatingBoostPanel> into the always-mounted root tree,
// so the panel persists while navigating away from Settings.
let _unpatch: (() => void) | null = null;

function tryInjectRootPanel(): (() => void) | null {
  // FIX: guard — if FloatingBoostPanel failed to import, skip injection entirely
  // rather than crashing React with a falsy component argument.
  if (!FloatingBoostPanel) {
    logger.warn("[VoiceBoost] FloatingBoostPanel import is falsy — skipping root injection, panel accessible via Settings only");
    return null;
  }

  // Candidates in order of preference
  const finders = [
    () => findByName("AppTabs", false),
    () => findByName("AppNavigator", false),
    () => findByName("NavigationContainer", false),
    () => findByName("DiscordApp", false),
    () => findByProps("tabBarVisible"),
    () => findByProps("getIsTabVisible"),
  ];

  for (const find of finders) {
    try {
      const target = find();
      if (!target) continue;

      // Determine the key to patch (default export or first key)
      const propKey =
        typeof target === "function" || target?.default
          ? "default"
          : Object.keys(target)[0];

      if (!target[propKey]) continue;

      const unpatch = after(propKey, target, (_, res: any) => {
        if (!res?.props) return;

        // FIX: double-check at call time too — belt-and-suspenders null guard
        if (!FloatingBoostPanel) return;

        const panel = React.createElement(
          FloatingBoostPanel as React.ComponentType,
          { key: "vb-root-panel" }
        );
        const ch = res.props.children;
        if (Array.isArray(ch)) {
          ch.push(panel);
        } else if (ch !== undefined && ch !== null) {
          res.props.children = [ch, panel];
        } else {
          res.props.children = panel;
        }
      });

      logger.log("[VoiceBoost] ✓ Root panel injected via", propKey);
      return unpatch;
    } catch (_) {
      // try next candidate
    }
  }

  logger.warn("[VoiceBoost] Root injection failed — panel accessible via Settings only");
  return null;
}

// ── Plugin export ─────────────────────────────────────────────────────────────
export default {
  onLoad() {
    initStorage();
    patchGUM();
    _unpatch = tryInjectRootPanel();
    logger.log("[VoiceBoost] Loaded");
  },

  onUnload() {
    unpatchGUM();
    _unpatch?.();
    _unpatch = null;
    logger.log("[VoiceBoost] Unloaded");
  },

  settings: Settings,
};
