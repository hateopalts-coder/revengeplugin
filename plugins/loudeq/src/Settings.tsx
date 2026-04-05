// ─────────────────────────────────────────────────────────────────────────────
//  VoiceBoost · Settings.tsx
//
//  Exports:
//    - FloatingBoostPanel   draggable overlay (injected by index.ts into root)
//    - openVBPanel()        imperative helper called from Settings button
//    - default Settings     plugin settings page
//
//  Panel chain displayed:
//    INPUT (Preamp) → EQ (Bass + Presence) → DRIVE (Overdrive) →
//    OUTPUT (Gain) → STEREO (Width / Mono) → COMPRESSOR
// ─────────────────────────────────────────────────────────────────────────────

import { React, ReactNative }   from "@vendetta/metro/common";
import { useProxy }             from "@vendetta/storage";
import { storage }              from "@vendetta/plugin";
import { engine, DEFAULT_SETTINGS, AudioSettings } from "./utils";

const {
  View, Text, TouchableOpacity, Modal,
  Animated, PanResponder,
  Switch, ScrollView, Dimensions,
  StyleSheet,
} = ReactNative;

type StorageWithSettings = typeof storage & AudioSettings;

// ─────────────────────────────────────────────────────────────────────────────
//  Global panel singleton state
// ─────────────────────────────────────────────────────────────────────────────
let _panelMounted = false;
let _setVisible: ((v: boolean) => void) | null = null;

/** Call from anywhere to show the floating panel */
export const openVBPanel  = () => _setVisible?.(true);
export const closeVBPanel = () => _setVisible?.(false);

// ─────────────────────────────────────────────────────────────────────────────
//  Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:         "#0c0d17",
  header:     "#111220",
  card:       "#13142a",
  border:     "rgba(124,58,237,0.32)",
  borderSub:  "#1e1e35",
  accent:     "#7c3aed",
  accentSoft: "rgba(124,58,237,0.12)",
  text:       "#e4e4f0",
  textSub:    "#8585a8",
  textDim:    "#42425a",
  trackBg:    "#1c1c30",
  green:      "#22c55e",
  blue:       "#3b82f6",
  blueDark:   "#1d4ed8",
  cyan:       "#0ea5e9",
  orange:     "#f97316",
  pink:       "#ec4899",
  red:        "#ef4444",
  purple:     "#a855f7",
};

// ─────────────────────────────────────────────────────────────────────────────
//  StyleSheet
// ─────────────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // ── Panel shell ────────────────────────────────────────────────────────────
  panel: {
    position: "absolute",
    backgroundColor: C.bg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.accent,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    elevation: 24,
    overflow: "hidden",
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: C.header,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  headerTitle: {
    color: C.text,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  livePill: {
    backgroundColor: C.green,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  liveText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  headerBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  headerBtn: {
    color: C.textSub,
    fontSize: 14,
    fontWeight: "700",
  },
  dragHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.textDim,
    alignSelf: "center",
  },

  // ── Body ──────────────────────────────────────────────────────────────────
  body: {
    padding: 14,
    paddingBottom: 10,
  },

  // ── Slider ────────────────────────────────────────────────────────────────
  sliderWrap: {
    marginBottom: 13,
  },
  sliderHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sliderLabel: {
    color: C.textDim,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  sliderVal: {
    color: C.textSub,
    fontSize: 11,
    fontWeight: "600",
    minWidth: 40,
    textAlign: "right",
  },
  sliderArea: {
    height: 24,
    justifyContent: "center",
    position: "relative",
  },
  sliderTrackBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: C.trackBg,
    borderRadius: 2,
  },
  sliderThumb: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#ffffff",
    borderWidth: 2.5,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },

  // ── Section divider ───────────────────────────────────────────────────────
  sectionDiv: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 10,
    gap: 8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.borderSub,
  },
  sectionLabel: {
    color: C.textDim,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2.5,
  },

  // ── Toggle row ────────────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 3,
    marginBottom: 6,
  },
  toggleLabel: {
    color: C.textSub,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  // ── Note box ──────────────────────────────────────────────────────────────
  noteBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: C.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.22)",
  },
  noteText: {
    color: C.textSub,
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
  },

  // ── Settings page ─────────────────────────────────────────────────────────
  settingsRoot: {
    flex: 1,
    backgroundColor: "#090a11",
  },
  statusCard: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  statusCardInfo: {
    flex: 1,
  },
  statusTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  statusSub: {
    color: C.textSub,
    fontSize: 12,
    marginTop: 4,
  },
  launchBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 13,
    backgroundColor: C.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: C.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  launchBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  infoCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 13,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderSub,
  },
  infoTitle: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  infoText: {
    color: C.textSub,
    fontSize: 12,
    lineHeight: 19,
  },
  chainRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  chainPill: {
    backgroundColor: C.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.25)",
  },
  chainPillText: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
//  VBSlider  — custom touch-driven slider
// ─────────────────────────────────────────────────────────────────────────────
interface VBSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  color?: string;
  decimals?: number;
  onChange: (v: number) => void;
}

function VBSlider({
  label, value, min, max,
  step = 0.1, unit = "", color = C.accent, decimals = 1,
  onChange,
}: VBSliderProps) {
  const [trackW, setTrackW] = React.useState(220);
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const pr = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant:  handleTouch,
      onPanResponderMove:   handleTouch,
    })
  ).current;

  function handleTouch(e: any) {
    const x       = Math.max(0, Math.min(trackW, e.nativeEvent.locationX));
    const raw     = min + (x / trackW) * (max - min);
    const snapped = Math.round(raw / step) * step;
    onChange(parseFloat(Math.max(min, Math.min(max, snapped)).toFixed(10)));
  }

  return (
    <View style={S.sliderWrap}>
      <View style={S.sliderHead}>
        <Text style={S.sliderLabel}>{label}</Text>
        <Text style={S.sliderVal}>
          {value.toFixed(decimals)}{unit}
        </Text>
      </View>
      <View
        style={S.sliderArea}
        onLayout={e => setTrackW(e.nativeEvent.layout.width || 220)}
        {...pr.panHandlers}
      >
        {/* Track background */}
        <View style={S.sliderTrackBg} />
        {/* Track fill */}
        <View
          style={{
            position: "absolute",
            left: 0,
            height: 3,
            borderRadius: 2,
            width: `${pct * 100}%` as any,
            backgroundColor: color,
            opacity: 0.9,
          }}
        />
        {/* Thumb */}
        <View
          style={[
            S.sliderThumb,
            {
              left: `${pct * 100}%` as any,
              marginLeft: -7,
              borderColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Section divider
// ─────────────────────────────────────────────────────────────────────────────
function SDiv({ title }: { title: string }) {
  return (
    <View style={S.sectionDiv}>
      <View style={S.sectionLine} />
      <Text style={S.sectionLabel}>{title}</Text>
      <View style={S.sectionLine} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Toggle row
// ─────────────────────────────────────────────────────────────────────────────
function TRow({
  label, value, onChange, color = C.accent,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}) {
  return (
    <View style={S.toggleRow}>
      <Text style={S.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: C.trackBg, true: color }}
        thumbColor="#ffffff"
        ios_backgroundColor={C.trackBg}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  FloatingBoostPanel — the main draggable overlay
// ─────────────────────────────────────────────────────────────────────────────
export function FloatingBoostPanel() {
  const [visible, setVisible] = React.useState(false);
  const [mini, setMini]       = React.useState(false);
  const [, tick]              = React.useReducer(x => x + 1, 0);

  const { width: SW, height: SH } = Dimensions.get("window");
  const PW = Math.min(SW - 28, 315);

  // ── Drag position ──────────────────────────────────────────────────────────
  const basePos = React.useRef({ x: (SW - PW) / 2, y: 90 });
  const startPos = React.useRef({ x: 0, y: 0 });
  const anim     = React.useRef(
    new Animated.ValueXY({ x: basePos.current.x, y: basePos.current.y })
  ).current;

  const dragPR = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        startPos.current = { ...basePos.current };
      },
      onPanResponderMove: (_, gs) => {
        anim.setValue({
          x: Math.max(0, Math.min(SW - PW,      startPos.current.x + gs.dx)),
          y: Math.max(0, Math.min(SH - 60, startPos.current.y + gs.dy)),
        });
      },
      onPanResponderRelease: (_, gs) => {
        basePos.current = {
          x: Math.max(0, Math.min(SW - PW,      startPos.current.x + gs.dx)),
          y: Math.max(0, Math.min(SH - 60, startPos.current.y + gs.dy)),
        };
      },
    })
  ).current;

  // ── Register as global singleton ───────────────────────────────────────────
  React.useEffect(() => {
    _panelMounted = true;
    _setVisible   = setVisible;
    return () => {
      _panelMounted = false;
      if (_setVisible === setVisible) _setVisible = null;
    };
  }, []);

  // ── Settings helpers ───────────────────────────────────────────────────────
  const proxy = storage as StorageWithSettings;

  function set<K extends keyof AudioSettings>(key: K, val: AudioSettings[K]) {
    engine.set(key, val);
    (proxy as any)[key] = val;
    tick();
  }

  const s = engine.settings;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={() => setVisible(false)}
      statusBarTranslucent
    >
      {/* Full-screen transparent backdrop — passes touches through to Discord */}
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <Animated.View
          pointerEvents="auto"
          style={[S.panel, { width: PW }, anim.getLayout()]}
        >

          {/* ── Header (drag target) ── */}
          <View style={S.header} {...dragPR.panHandlers}>
            {/* Drag handle bar */}
            <View style={S.dragHandle} />

            <View style={S.headerLeft}>
              <Text style={{ color: C.accent, fontSize: 15 }}>🎙</Text>
              <Text style={S.headerTitle}>VOICEBOOST</Text>
              {s.enabled && (
                <View style={S.livePill}>
                  <Text style={S.liveText}>LIVE</Text>
                </View>
              )}
            </View>

            <View style={S.headerBtns}>
              {/* Minimize / Expand */}
              <TouchableOpacity onPress={() => setMini(m => !m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={S.headerBtn}>{mini ? "⊞" : "⊟"}</Text>
              </TouchableOpacity>
              {/* Close */}
              <TouchableOpacity onPress={() => setVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[S.headerBtn, { color: C.red }]}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Body (hidden when minimised) ── */}
          {!mini && (
            <ScrollView
              style={{ maxHeight: SH * 0.70 }}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={S.body}>

                {/* ─── Master toggle ─────────────────────────────────────── */}
                <TRow
                  label="⚡  ENABLE PROCESSING"
                  value={s.enabled}
                  onChange={v => set("enabled", v)}
                  color={s.enabled ? C.green : C.accent}
                />

                {/* ─── INPUT ─────────────────────────────────────────────── */}
                <SDiv title="INPUT" />
                <VBSlider
                  label="PREAMP"
                  value={s.preamp} min={1} max={4} step={0.05}
                  unit="×" decimals={2}
                  color={C.accent}
                  onChange={v => set("preamp", v)}
                />

                {/* ─── EQ ─────────────────────────────────────────────────── */}
                <SDiv title="EQ" />
                <VBSlider
                  label="BASS GAIN"
                  value={s.bassGain} min={-6} max={24} step={0.5}
                  unit=" dB" decimals={1}
                  color={C.blue}
                  onChange={v => set("bassGain", v)}
                />
                <VBSlider
                  label="BASS FREQ"
                  value={s.bassFreq} min={40} max={250} step={5}
                  unit=" Hz" decimals={0}
                  color={C.blueDark}
                  onChange={v => set("bassFreq", v)}
                />
                <VBSlider
                  label="PRESENCE"
                  value={s.presenceGain} min={-6} max={12} step={0.5}
                  unit=" dB" decimals={1}
                  color={C.cyan}
                  onChange={v => set("presenceGain", v)}
                />

                {/* ─── DRIVE ──────────────────────────────────────────────── */}
                <SDiv title="DRIVE" />
                <VBSlider
                  label="OVERDRIVE"
                  value={s.overdrive} min={0} max={1} step={0.01}
                  decimals={2}
                  color={C.orange}
                  onChange={v => set("overdrive", v)}
                />

                {/* ─── OUTPUT ─────────────────────────────────────────────── */}
                <SDiv title="OUTPUT" />
                <VBSlider
                  label="MAIN GAIN"
                  value={s.gain} min={1} max={6} step={0.1}
                  unit="×" decimals={1}
                  color={C.green}
                  onChange={v => set("gain", v)}
                />

                {/* ─── STEREO ─────────────────────────────────────────────── */}
                <SDiv title="STEREO" />
                <VBSlider
                  label="STEREO WIDTH"
                  value={s.stereoWidth} min={0} max={1} step={0.01}
                  decimals={2}
                  color={C.purple}
                  onChange={v => set("stereoWidth", v)}
                />
                <TRow
                  label="MONO MODE"
                  value={s.stereoMono}
                  onChange={v => set("stereoMono", v)}
                  color={C.textSub}
                />

                {/* ─── COMPRESSOR ─────────────────────────────────────────── */}
                <SDiv title="COMPRESSOR" />
                <TRow
                  label="COMPRESSOR"
                  value={s.compEnabled}
                  onChange={v => set("compEnabled", v)}
                  color={C.green}
                />
                <VBSlider
                  label="THRESHOLD"
                  value={s.compThreshold} min={-60} max={0} step={1}
                  unit=" dB" decimals={0}
                  color={C.pink}
                  onChange={v => set("compThreshold", v)}
                />
                <VBSlider
                  label="RATIO"
                  value={s.compRatio} min={1} max={20} step={0.5}
                  unit=":1" decimals={1}
                  color={C.pink}
                  onChange={v => set("compRatio", v)}
                />

                {/* ─── Note ───────────────────────────────────────────────── */}
                <View style={S.noteBox}>
                  <Text style={S.noteText}>
                    💡  After toggling Enable, rejoin a voice channel for processing to take effect
                  </Text>
                </View>

              </View>
            </ScrollView>
          )}

        </Animated.View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Settings page (shown in plugin settings list)
// ─────────────────────────────────────────────────────────────────────────────
const CHAIN_STEPS = [
  "Preamp", "Bass EQ", "Presence", "Overdrive",
  "Gain", "Stereo", "Compressor",
];

export default function Settings() {
  useProxy(storage);
  const [, tick] = React.useReducer(x => x + 1, 0);

  // Rehydrate engine from storage on first render
  React.useEffect(() => {
    const s = storage as any;
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AudioSettings)[]) {
      if (s[key] !== undefined) (engine.settings as any)[key] = s[key];
    }
    tick();
  }, []);

  const s = engine.settings;

  return (
    <View style={S.settingsRoot}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Status card ───────────────────────────────────────────────── */}
        <View style={S.statusCard}>
          <Text style={{ fontSize: 38 }}>🎙️</Text>
          <View style={S.statusCardInfo}>
            <Text style={S.statusTitle}>VoiceBoost</Text>
            <Text style={S.statusSub}>
              {s.enabled
                ? `🟢  Active — Gain ×${s.gain.toFixed(1)}  Bass +${s.bassGain.toFixed(0)} dB`
                : "⚫  Open panel to configure"}
            </Text>
          </View>
        </View>

        {/* ── Launch button ────────────────────────────────────────────── */}
        <TouchableOpacity
          style={S.launchBtn}
          onPress={openVBPanel}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 20 }}>🎛️</Text>
          <Text style={S.launchBtnText}>Open Floating Panel</Text>
        </TouchableOpacity>

        {/* ── Info card ────────────────────────────────────────────────── */}
        <View style={S.infoCard}>
          <Text style={S.infoTitle}>HOW IT WORKS</Text>
          <Text style={S.infoText}>
            Intercepts Discord's mic stream and runs it through a Web Audio processing chain before sending to voice channels.
            {"\n\n"}
            Enable processing, then rejoin a voice channel. The panel floats above Discord and can be dragged anywhere.
          </Text>
          <View style={S.chainRow}>
            {CHAIN_STEPS.map(step => (
              <View key={step} style={S.chainPill}>
                <Text style={S.chainPillText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>

      {/*
        Render panel here as fallback IF root injection in index.ts failed.
        If root-injected FloatingBoostPanel already mounted, _panelMounted = true
        and we skip rendering a second instance.
      */}
      {!_panelMounted && <FloatingBoostPanel />}
    </View>
  );
}
