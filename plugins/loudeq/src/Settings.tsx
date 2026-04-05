// ─────────────────────────────────────────────────────────────────────────────
//  VoiceBoost · Settings.tsx
//  All controls live directly in the Settings page — no floating panel, no Modal.
// ─────────────────────────────────────────────────────────────────────────────

import { React, ReactNative }              from "@vendetta/metro/common";
import { useProxy }                        from "@vendetta/storage";
import { storage }                         from "@vendetta/plugin";
import { engine, DEFAULT_SETTINGS, AudioSettings } from "./utils";

const {
  View, Text, Switch, ScrollView,
  TouchableOpacity, PanResponder,
  StyleSheet,
} = ReactNative;

type S = typeof storage & AudioSettings;

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:         "#090a11",
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
  purple:     "#a855f7",
  red:        "#ef4444",
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // status card
  statusCard: {
    margin: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  statusInfo: { flex: 1 },
  statusTitle: { color: C.text, fontSize: 18, fontWeight: "800" },
  statusSub:   { color: C.textSub, fontSize: 12, marginTop: 4 },

  // section
  section: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderSub,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: C.borderSub },
  sectionLabel: {
    color: C.textDim,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2.5,
  },

  // slider
  sliderWrap:  { marginBottom: 14 },
  sliderHead:  { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  sliderLabel: { color: C.textDim, fontSize: 9, fontWeight: "700", letterSpacing: 1.5 },
  sliderVal:   { color: C.textSub, fontSize: 11, fontWeight: "600" },
  sliderArea:  { height: 26, justifyContent: "center", position: "relative" },
  sliderTrack: {
    position: "absolute", left: 0, right: 0,
    height: 3, backgroundColor: C.trackBg, borderRadius: 2,
  },
  sliderThumb: {
    position: "absolute",
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: "#fff", borderWidth: 2.5,
    elevation: 4,
  },

  // toggle
  toggleRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4, marginBottom: 6,
  },
  toggleLabel: { color: C.textSub, fontSize: 12, fontWeight: "600" },

  // master toggle card
  masterCard: {
    margin: 14,
    marginBottom: 0,
    padding: 16,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  masterLeft: { gap: 3 },
  masterTitle: { color: C.text, fontSize: 15, fontWeight: "800" },
  masterSub:   { color: C.textSub, fontSize: 11 },

  // note
  noteBox: {
    marginHorizontal: 14,
    marginBottom: 24,
    padding: 12,
    borderRadius: 10,
    backgroundColor: C.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.22)",
  },
  noteText: { color: C.textSub, fontSize: 11, lineHeight: 16, textAlign: "center" },
});

// ─── VBSlider ─────────────────────────────────────────────────────────────────
function VBSlider({
  label, value, min, max, step = 0.1, unit = "", color = C.accent, decimals = 1,
  onChange,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; color?: string; decimals?: number;
  onChange: (v: number) => void;
}) {
  const [trackW, setTrackW] = React.useState(280);
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const pr = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: handleTouch,
      onPanResponderMove:  handleTouch,
    })
  ).current;

  function handleTouch(e: any) {
    const x = Math.max(0, Math.min(trackW, e.nativeEvent.locationX));
    const raw = min + (x / trackW) * (max - min);
    const snapped = Math.round(raw / step) * step;
    onChange(parseFloat(Math.max(min, Math.min(max, snapped)).toFixed(10)));
  }

  return (
    <View style={S.sliderWrap}>
      <View style={S.sliderHead}>
        <Text style={S.sliderLabel}>{label}</Text>
        <Text style={S.sliderVal}>{value.toFixed(decimals)}{unit}</Text>
      </View>
      <View
        style={S.sliderArea}
        onLayout={e => setTrackW(e.nativeEvent.layout.width || 280)}
        {...pr.panHandlers}
      >
        <View style={S.sliderTrack} />
        <View style={{
          position: "absolute", left: 0, height: 3, borderRadius: 2,
          width: `${pct * 100}%` as any, backgroundColor: color, opacity: 0.9,
        }} />
        <View style={[S.sliderThumb, {
          left: `${pct * 100}%` as any, marginLeft: -8, borderColor: color,
        }]} />
      </View>
    </View>
  );
}

// ─── TRow ─────────────────────────────────────────────────────────────────────
function TRow({ label, value, onChange, color = C.accent }: {
  label: string; value: boolean; onChange: (v: boolean) => void; color?: string;
}) {
  return (
    <View style={S.toggleRow}>
      <Text style={S.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: C.trackBg, true: color }}
        thumbColor="#fff"
        ios_backgroundColor={C.trackBg}
      />
    </View>
  );
}

// ─── SDiv ─────────────────────────────────────────────────────────────────────
function SDiv({ title }: { title: string }) {
  return (
    <View style={S.sectionHeader}>
      <View style={S.sectionLine} />
      <Text style={S.sectionLabel}>{title}</Text>
      <View style={S.sectionLine} />
    </View>
  );
}

// ─── Settings (default export) ────────────────────────────────────────────────
export default function Settings() {
  useProxy(storage);
  const [, tick] = React.useReducer(x => x + 1, 0);

  // Rehydrate engine from storage on mount
  React.useEffect(() => {
    const s = storage as any;
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AudioSettings)[]) {
      if (s[key] !== undefined) (engine.settings as any)[key] = s[key];
    }
    tick();
  }, []);

  const e = engine.settings;

  function set<K extends keyof AudioSettings>(key: K, val: AudioSettings[K]) {
    engine.set(key, val);
    (storage as any)[key] = val;
    tick();
  }

  return (
    <ScrollView style={S.root} showsVerticalScrollIndicator={false}>

      {/* ── Status card ── */}
      <View style={S.statusCard}>
        <Text style={{ fontSize: 36 }}>🎙️</Text>
        <View style={S.statusInfo}>
          <Text style={S.statusTitle}>VoiceBoost</Text>
          <Text style={S.statusSub}>
            {e.enabled
              ? `🟢  Active — Gain ×${e.gain.toFixed(1)}  Bass +${e.bassGain.toFixed(0)} dB`
              : "⚫  Disabled — toggle to enable"}
          </Text>
        </View>
      </View>

      {/* ── Master toggle ── */}
      <View style={S.masterCard}>
        <View style={S.masterLeft}>
          <Text style={S.masterTitle}>⚡  Enable Processing</Text>
          <Text style={S.masterSub}>Rejoin VC after toggling</Text>
        </View>
        <Switch
          value={e.enabled}
          onValueChange={v => set("enabled", v)}
          trackColor={{ false: C.trackBg, true: C.green }}
          thumbColor="#fff"
          ios_backgroundColor={C.trackBg}
        />
      </View>

      {/* ── INPUT ── */}
      <View style={[S.section, { marginTop: 14 }]}>
        <SDiv title="INPUT" />
        <VBSlider
          label="PREAMP" value={e.preamp} min={1} max={4} step={0.05}
          unit="×" decimals={2} color={C.accent}
          onChange={v => set("preamp", v)}
        />
      </View>

      {/* ── EQ ── */}
      <View style={S.section}>
        <SDiv title="EQ" />
        <VBSlider
          label="BASS GAIN" value={e.bassGain} min={-6} max={24} step={0.5}
          unit=" dB" decimals={1} color={C.blue}
          onChange={v => set("bassGain", v)}
        />
        <VBSlider
          label="BASS FREQ" value={e.bassFreq} min={40} max={250} step={5}
          unit=" Hz" decimals={0} color={C.blueDark}
          onChange={v => set("bassFreq", v)}
        />
        <VBSlider
          label="PRESENCE" value={e.presenceGain} min={-6} max={12} step={0.5}
          unit=" dB" decimals={1} color={C.cyan}
          onChange={v => set("presenceGain", v)}
        />
      </View>

      {/* ── DRIVE ── */}
      <View style={S.section}>
        <SDiv title="DRIVE" />
        <VBSlider
          label="OVERDRIVE" value={e.overdrive} min={0} max={1} step={0.01}
          decimals={2} color={C.orange}
          onChange={v => set("overdrive", v)}
        />
      </View>

      {/* ── OUTPUT ── */}
      <View style={S.section}>
        <SDiv title="OUTPUT" />
        <VBSlider
          label="MAIN GAIN" value={e.gain} min={1} max={6} step={0.1}
          unit="×" decimals={1} color={C.green}
          onChange={v => set("gain", v)}
        />
      </View>

      {/* ── STEREO ── */}
      <View style={S.section}>
        <SDiv title="STEREO" />
        <VBSlider
          label="STEREO WIDTH" value={e.stereoWidth} min={0} max={1} step={0.01}
          decimals={2} color={C.purple}
          onChange={v => set("stereoWidth", v)}
        />
        <TRow
          label="Mono Mode"
          value={e.stereoMono}
          onChange={v => set("stereoMono", v)}
          color={C.textSub}
        />
      </View>

      {/* ── COMPRESSOR ── */}
      <View style={S.section}>
        <SDiv title="COMPRESSOR" />
        <TRow
          label="Enable Compressor"
          value={e.compEnabled}
          onChange={v => set("compEnabled", v)}
          color={C.green}
        />
        <VBSlider
          label="THRESHOLD" value={e.compThreshold} min={-60} max={0} step={1}
          unit=" dB" decimals={0} color={C.pink}
          onChange={v => set("compThreshold", v)}
        />
        <VBSlider
          label="RATIO" value={e.compRatio} min={1} max={20} step={0.5}
          unit=":1" decimals={1} color={C.pink}
          onChange={v => set("compRatio", v)}
        />
      </View>

      {/* ── Note ── */}
      <View style={S.noteBox}>
        <Text style={S.noteText}>
          💡  Enable processing → rejoin voice channel → mic will be louder
        </Text>
      </View>

    </ScrollView>
  );
}
