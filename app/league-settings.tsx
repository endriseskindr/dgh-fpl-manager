import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useWarRoomData } from "../hooks/useWarRoomData";
import {
  getDghLeagueConfig,
  saveDghLeagueConfig,
  getManagerOverrides,
  setManagerOverride,
  type DghLeagueConfig,
  type ManagerOverride,
} from "../lib/seasonStore";
import { LoadingShell, ErrorBlock } from "../components/StatusStates";
import { Page, Header, Surface, Section, Row, Pill } from "../components/Premium";

const DEFAULT_CONFIG: DghLeagueConfig = {
  prizePoolPerGw: 0,
  feePerGw: 100,
  relegationFine: 50,
  relegationEnabled: true,
  currency: "ETB",
  prizePct1st: 50,
  prizePct2nd: 30,
  prizePct3rd: 20,
};

function Field({ label, value, onChangeText, keyboardType = "default", placeholder }: { label: string; value: string; onChangeText: (v: string) => void; keyboardType?: "default" | "numeric"; placeholder?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: theme.muted, fontSize: 10, fontWeight: "800", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: theme.foreground, fontSize: 13, fontWeight: "700" }}
      />
    </View>
  );
}

export default function LeagueSettingsScreen() {
  const { theme } = useTheme();
  const { data, isLoading: warRoomLoading, isError, error, refetch } = useWarRoomData();

  const [config, setConfig] = useState<DghLeagueConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [overrides, setOverrides] = useState<ManagerOverride[]>([]);

  // Draft strings so the user can freely type/clear a numeric field without
  // fighting a live-parsed value on every keystroke.
  const [feeDraft, setFeeDraft] = useState("");
  const [poolDraft, setPoolDraft] = useState("");
  const [fineDraft, setFineDraft] = useState("");
  const [currencyDraft, setCurrencyDraft] = useState("");
  const [pct1Draft, setPct1Draft] = useState("");
  const [pct2Draft, setPct2Draft] = useState("");
  const [pct3Draft, setPct3Draft] = useState("");

  useEffect(() => {
    void (async () => {
      const [cfg, ov] = await Promise.all([getDghLeagueConfig(), getManagerOverrides()]);
      setConfig(cfg);
      setOverrides(ov);
      setFeeDraft(String(cfg.feePerGw));
      setPoolDraft(cfg.prizePoolPerGw > 0 ? String(cfg.prizePoolPerGw) : "");
      setFineDraft(String(cfg.relegationFine));
      setCurrencyDraft(cfg.currency);
      setPct1Draft(String(cfg.prizePct1st));
      setPct2Draft(String(cfg.prizePct2nd));
      setPct3Draft(String(cfg.prizePct3rd));
      setLoading(false);
    })();
  }, []);

  const pctTotal = (Number(pct1Draft) || 0) + (Number(pct2Draft) || 0) + (Number(pct3Draft) || 0);
  const pctValid = pctTotal === 100;

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const next: DghLeagueConfig = {
        currency: currencyDraft.trim() || "ETB",
        feePerGw: Math.max(0, Number(feeDraft) || 0),
        prizePoolPerGw: Math.max(0, Number(poolDraft) || 0),
        relegationFine: Math.max(0, Number(fineDraft) || 0),
        relegationEnabled: config.relegationEnabled,
        prizePct1st: Number(pct1Draft) || 0,
        prizePct2nd: Number(pct2Draft) || 0,
        prizePct3rd: Number(pct3Draft) || 0,
      };
      await saveDghLeagueConfig(next);
      setConfig(next);
      setSaved(true);
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const overrideMap = useMemo(() => {
    if (!data) return new Map<number, ManagerOverride>();
    return new Map(overrides.filter((o) => o.event === data.gameweek).map((o) => [o.entryId, o]));
  }, [overrides, data]);

  const toggleWaiver = async (entryId: number, field: "feeWaived" | "fineWaived") => {
    if (!data) return;
    const existing = overrideMap.get(entryId);
    const next: ManagerOverride = {
      entryId,
      event: data.gameweek,
      feeWaived: existing?.feeWaived ?? false,
      fineWaived: existing?.fineWaived ?? false,
      note: existing?.note ?? null,
    };
    next[field] = !next[field];
    await setManagerOverride(next);
    const rest = overrides.filter((o) => !(o.entryId === entryId && o.event === data.gameweek));
    setOverrides([...rest, next]);
    await refetch();
  };

  if (loading || warRoomLoading) return <LoadingShell label="Loading league settings…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Data unavailable")} onRetry={() => refetch()} />;

  return (
    <Page>
      <Header eyebrow="LEAGUE SETUP" title="League Settings" subtitle="Configure fees, prize splits, relegation rules and currency for this mini-league." />

      <Section title="Money rules" />
      <Surface>
        <Field label={`GW entry fee`} value={feeDraft} onChangeText={setFeeDraft} keyboardType="numeric" placeholder="100" />
        <Field label="Currency" value={currencyDraft} onChangeText={setCurrencyDraft} placeholder="ETB" />
        <Field label="Prize pool per GW (0 = auto: fee × paying managers)" value={poolDraft} onChangeText={setPoolDraft} keyboardType="numeric" placeholder="0" />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="1st %" value={pct1Draft} onChangeText={setPct1Draft} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="2nd %" value={pct2Draft} onChangeText={setPct2Draft} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="3rd %" value={pct3Draft} onChangeText={setPct3Draft} keyboardType="numeric" />
          </View>
        </View>
        {!pctValid ? (
          <Text style={{ color: theme.warning, fontSize: 11, fontWeight: "700", marginBottom: 8 }}>Prize splits total {pctTotal}% — should add up to 100%.</Text>
        ) : null}
      </Surface>

      <Section title="Relegation" />
      <Surface>
        <Pressable
          onPress={() => setConfig((c) => ({ ...c, relegationEnabled: !c.relegationEnabled }))}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: config.relegationEnabled ? 12 : 0 }}
        >
          <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12 }}>Relegation fine enabled</Text>
          <Pill label={config.relegationEnabled ? "ON" : "OFF"} tone={config.relegationEnabled ? "success" : "neutral"} />
        </Pressable>
        {config.relegationEnabled ? <Field label="Relegation fine amount" value={fineDraft} onChangeText={setFineDraft} keyboardType="numeric" placeholder="50" /> : null}
      </Surface>

      <Pressable onPress={() => void save()} disabled={saving} style={{ minHeight: 48, borderRadius: 13, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center", opacity: saving ? 0.6 : 1, marginBottom: 8 }}>
        <Text style={{ color: theme.background, fontWeight: "900", fontSize: 13 }}>{saving ? "SAVING…" : "SAVE LEAGUE SETTINGS"}</Text>
      </Pressable>
      {saved ? <Text style={{ color: theme.success, fontSize: 11, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>Saved. All tables now use the new rules.</Text> : null}

      <Section title={`This GW's waivers (GW${data.gameweek})`} />
      <Surface>
        <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 10, lineHeight: 16 }}>
          Waive an individual manager&apos;s fee or relegation fine for this gameweek only — e.g. a new joiner or an agreed exemption.
        </Text>
        <ScrollView style={{ maxHeight: 340 }} nestedScrollEnabled>
          {data.standings.map((s) => {
            const ov = overrideMap.get(s.entry);
            return (
              <View key={s.entry} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border + "60" }}>
                <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12, marginBottom: 6 }}>{s.entry_name}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={() => void toggleWaiver(s.entry, "feeWaived")} style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: ov?.feeWaived ? theme.success : theme.border, backgroundColor: ov?.feeWaived ? theme.success + "22" : theme.surfaceAlt, paddingVertical: 8, alignItems: "center" }}>
                    <Text style={{ color: ov?.feeWaived ? theme.success : theme.muted, fontSize: 10, fontWeight: "800" }}>{ov?.feeWaived ? "FEE WAIVED" : "WAIVE FEE"}</Text>
                  </Pressable>
                  <Pressable onPress={() => void toggleWaiver(s.entry, "fineWaived")} style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: ov?.fineWaived ? theme.success : theme.border, backgroundColor: ov?.fineWaived ? theme.success + "22" : theme.surfaceAlt, paddingVertical: 8, alignItems: "center" }}>
                    <Text style={{ color: ov?.fineWaived ? theme.success : theme.muted, fontSize: 10, fontWeight: "800" }}>{ov?.fineWaived ? "FINE WAIVED" : "WAIVE FINE"}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </Surface>

      <Section title="Preview" />
      <Surface>
        <Row label="Prize split" value={`${pct1Draft || 0}/${pct2Draft || 0}/${pct3Draft || 0}`} />
        <Row label="GW fee" value={`${currencyDraft || "ETB"} ${feeDraft || 0}`} />
        <Row label="Relegation fine" value={config.relegationEnabled ? `${currencyDraft || "ETB"} ${fineDraft || 0}` : "Disabled"} />
        <Row label="Prize pool source" value={Number(poolDraft) > 0 ? "Fixed pool" : "Auto (fee × managers)"} />
      </Surface>
    </Page>
  );
}
