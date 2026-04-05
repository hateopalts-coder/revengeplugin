// ─────────────────────────────────────────────────────────────────────────────
//  VoiceBoost · Settings.tsx  (no PanResponder, no Modal, no Animated)
//  All controls via +/- buttons — maximum Revenge compatibility
// ─────────────────────────────────────────────────────────────────────────────

import { React, ReactNative }              from "@vendetta/metro/common";
import { useProxy }                        from "@vendetta/storage";
import { storage }                         from "@vendetta/plugin";
import { engine, DEFAULT_SETTINGS, AudioSettings } from "./utils";

const { View, Text, Switch, ScrollView, TouchableOpacity, StyleSheet } = ReactNative;

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg:        "#090a11",
  card:      "#13142a",
  border:    "rgba(124,58,237,0.32)",
  borderSub: "#1e1e35",
  accent:    "#7c3aed",
  accentSoft:"rgba(124,58,237,0.12)",
  text:      "#e4e4f0",
  sub:       "#8585a8",
  dim:       "#42425a",
  trackBg:   "#1c1c30",
  green:     "#22c55e",
  blue:      "#3b82f6",
  blueDark:  "#1d4ed8",
  cyan:      "#0ea5e9",
  orange:    "#f97316",
  pink:      "#ec4899",
  purple:    "#a855f7",
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bg },
  scroll:     { flex: 1 },

  // cards
  card: {
    marginHorizontal: 14, marginBottom: 12,
    padding: 14, borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1, borderColor: C.borderSub,
  },
  statusCard: {
    marginHorizontal: 14, marginBottom: 12, marginTop: 14,
    padding: 14, borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  statusInfo: { flex: 1 },
  statusTitle:{ color: C.text, fontSize: 17, fontWeight: "800" },
  statusSub:  { color: C.sub, fontSize: 12, marginTop: 3 },

  // section label
  sectionRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12,
  },
  sectionLine:  { flex: 1, height: 1, backgroundColor: C.borderSub },
  sectionLabel: { color: C.dim, fontSize: 9, fontWeight: "700", letterSpacing: 2.5 },

  // toggle row
  toggleRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingVertical: 4, marginBottom: 6,
  },
  toggleLabel: { color: C.sub, fontSize: 12, fontWeight: "600" },

  // master toggle
  masterCard: {
    marginHorizontal: 14, marginBottom: 12,
    padding: 16, borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  masterTitle: { color: C.text, fontSize: 15, fontWeight: "800" },
  masterSub:   { color: C.sub, fontSize: 11, marginTop: 2 },

  // stepper control
  stepRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 10,
  },
  stepLabel: { color: C.dim, fontSize: 9, fontWeight: "700", letterSpacing: 1.5, flex: 1 },
  stepControls: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: "rgba(124,58,237,0.18)",
    borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  stepBtnTxt: { color: C.accent, fontSize: 18, fontWeight: "700", lineHeight: 22 },
  stepVal: {
    color: C.text, fontSize: 13, fontWeight: "700",
    minWidth: 58, textAlign: "center",
  },

  // note
  note: {
    marginHorizontal: 14, marginBottom: 24,
    padding: 12, borderRadius: 10,
    backgroundColor: C.accentSoft,
    borderWidth: 1, borderColor: "rgba(124,58,237,0.22)",
  },
  noteTxt: { color: C.sub, fontSize: 11, lineHeight: 16, textAlign: "center" },
});

// ─── Stepper (replaces PanResponder slider) ───────────────────────────────────
function Stepper({
  label, value, min, max, step = 0.1, unit = "", decimals = 1, color = C.accent,
  onChange,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; decimals?: number; color?: string;
  onChange: (v: number) => void;
}) {
  function snap(v: number) {
    return parseFloat(Math.max(min, Math.min(max, v)).toFixed(decimals));
  }

  return (
    <View style={S.stepRow}>
      <Text style={[S.stepLabel, { color }]}>{label}</Text>
      <View style={S.stepControls}>
        <TouchableOpacity
          style={S.stepBtn}
          onPress={() => onChange(snap(value - step))}
          activeOpacity={0.7}
        >
          <Text style={[S.stepBtnTxt, { color }]}>−</Text>
        </TouchableOpacity>

        <Text style={S.stepVal}>{value.toFixed(decimals)}{unit}</Text>

        <TouchableOpacity
          style={S.stepBtn}
          onPress={() => onChange(snap(value + step))}
          activeOpacity={0.7}
        >
          <Text style={[S.stepBtnTxt, { color }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────
function TRow({ label, value, onChange, color = C.accent }: {
  label: string; value: boolean;
  onChange: (v: boolean) => void; color?: string;
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

// ─── Section divider ──────────────────────────────────────────────────────────
function Sec({ title }: { title: string }) {
  return (
    <View style={S.sectionRow}>
      <View style={S.sectionLine} />
      <Text style={S.sectionLabel}>{title}</Text>
      <View style={S.sectionLine} />
    </View>
  );
}

// ─── Main Settings ────────────────────────────────────────────────────────────
export default function Settings() {
  useProxy(storage);
  const [, tick] = React.useReducer((x: number) => x + 1, 0);

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
    <View style={S.root}>
      <ScrollView style={S.scroll} showsVerticalScrollIndicator={false}>

        {/* Status */}
        <View style={S.statusCard}>
          <Text style={{ fontSize: 34 }}>🎙️</Text>
          <View style={S.statusInfo}>
            <Text style={S.statusTitle}>VoiceBoost</Text>
            <Text style={S.statusSub}>
              {e.enabled
                ? `🟢  Active  ·  Gain ×${e.gain.toFixed(1)}  ·  Bass +${e.bassGain.toFixed(0)} dB`
                : "⚫  Disabled — toggle below to enable"}
            </Text>
          </View>
        </View>

        {/* Master enable */}
        <View style={S.masterCard}>
          <View>
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

        {/* INPUT */}
        <View style={S.card}>
          <Sec title="INPUT" />
          <Stepper label="PREAMP" value={e.preamp} min={1} max={4} step={0.1}
            unit="×" decimals={1} color={C.accent}
            onChange={v => set("preamp", v)} />
        </View>

        {/* EQ */}
        <View style={S.card}>
          <Sec title="EQ" />
          <Stepper label="BASS GAIN" value={e.bassGain} min={-6} max={24} step={1}
            unit=" dB" decimals={0} color={C.blue}
            onChange={v => set("bassGain", v)} />
          <Stepper label="BASS FREQ" value={e.bassFreq} min={40} max={250} step={10}
            unit=" Hz" decimals={0} color={C.blueDark}
            onChange={v => set("bassFreq", v)} />
          <Stepper label="PRESENCE" value={e.presenceGain} min={-6} max={12} step={1}
            unit=" dB" decimals={0} color={C.cyan}
            onChange={v => set("presenceGain", v)} />
        </View>

        {/* DRIVE */}
        <View style={S.card}>
          <Sec title="DRIVE" />
          <Stepper label="OVERDRIVE" value={e.overdrive} min={0} max={1} step={0.05}
            decimals={2} color={C.orange}
            onChange={v => set("overdrive", v)} />
        </View>

        {/* OUTPUT */}
        <View style={S.card}>
          <Sec title="OUTPUT" />
          <Stepper label="MAIN GAIN" value={e.gain} min={1} max={6} step={0.2}
            unit="×" decimals={1} color={C.green}
            onChange={v => set("gain", v)} />
        </View>

        {/* STEREO */}
        <View style={S.card}>
          <Sec title="STEREO" />
          <Stepper label="WIDTH" value={e.stereoWidth} min={0} max={1} step={0.05}
            decimals={2} color={C.purple}
            onChange={v => set("stereoWidth", v)} />
          <TRow label="Mono Mode" value={e.stereoMono}
            onChange={v => set("stereoMono", v)} color={C.sub} />
        </View>

        {/* COMPRESSOR */}
        <View style={S.card}>
          <Sec title="COMPRESSOR" />
          <TRow label="Enable Compressor" value={e.compEnabled}
            onChange={v => set("compEnabled", v)} color={C.green} />
          <Stepper label="THRESHOLD" value={e.compThreshold} min={-60} max={0} step={1}
            unit=" dB" decimals={0} color={C.pink}
            onChange={v => set("compThreshold", v)} />
          <Stepper label="RATIO" value={e.compRatio} min={1} max={20} step={0.5}
            unit=":1" decimals={1} color={C.pink}
            onChange={v => set("compRatio", v)} />
        </View>

        {/* Note */}
        <View style={S.note}>
          <Text style={S.noteTxt}>
            💡  After enabling, rejoin voice channel for processing to take effect
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}
