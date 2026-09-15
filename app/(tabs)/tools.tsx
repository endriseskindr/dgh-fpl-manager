import { useState } from "react";
import { ActivityIndicator, Pressable, Share, Text, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { projectNextGw } from "../../lib/analytics/projection";
import { buildTransferScenarios } from "../../lib/analytics/transferEngine";
import { LoadingShell } from "../../components/StatusStates";
import { Page, Header, Surface, Hero, Metric, Pill } from "../../components/Premium";

export default function ToolsScreen() {
  const { theme } = useTheme();
  const { data, isLoading, error, refresh } = useWarRoomData();
  const [running, setRunning] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } };

  const makeReport = (kind: string) => {
    if (!data) return "DGH FPL DOMINATOR\nOfficial FPL data unavailable.";
    const xi = data.mySquad.filter((p) => p.isXI);
    const captain = data.mySquad.find((p) => p.isCaptain);
    const scenarios = buildTransferScenarios(data.mySquad, data.playerPool, data.bank, data.freeTransfers);
    const best = scenarios.slice(1).filter((s) => s.moves.length).sort((a, b) => b.netGain - a.netGain)[0];
    const base = [
      `DGH FPL DOMINATOR — ${kind}`,
      `Planning GW${data.planningGameweek} · ${data.planningGameweekName}`,
      `League rank: #${data.myRow?.dghRank ?? data.myRow?.rank ?? "—"}`,
      `Points: ${data.myRow?.dghTotalPoints ?? data.myRow?.total ?? "—"}`,
      `Free transfers: ${data.freeTransfers}`,
      `Captain: ${captain?.player.webName ?? "—"}`,
      `XI projection: ${(xi.reduce((sum, p) => sum + projectNextGw(p.player), 0) + (data.mySquad.find((p) => p.isCaptain)?.player ? projectNextGw(data.mySquad.find((p) => p.isCaptain)!.player) : 0)).toFixed(1)}`,
    ];
    if (best) base.push(`Best transfer scenario: ${best.moves.map((m) => `${m.out.webName}→${m.in.webName}`).join(", ")}`, `Net gain after hits: ${best.netGain.toFixed(1)}`);
    return base.join("\n");
  };
  const run = async (kind: string) => {
    setRunning(kind);
    try {
      await refresh();
      await Share.share({ title: `DGH ${kind}`, message: makeReport(kind) });
    } finally {
      setRunning(null);
    }
  };
  const actions = ["FULL UPDATE", "RIVALS", "TRANSFERS", "CAPTAIN", "FIXTURES", "STATUS"];

  if (isLoading) return <LoadingShell label="Preparing command center…" />;

  return (
    <Page refreshing={refreshing} onRefresh={() => void doRefresh()}>
      <Header eyebrow="NATIVE COMMAND CENTER" title="DGH Tools" subtitle="Read-only intelligence reports using verified official FPL data" />

      <Hero variant="green">
        <Pill label={data ? (data.stale ? "CACHED OFFICIAL DATA" : "LIVE CONNECTED") : "DATA UNAVAILABLE"} tone="onHero" />
        <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 10 }}>Share intelligence reports</Text>
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, marginTop: 3 }}>Reports share through the Android share sheet</Text>
        <View style={{ flexDirection: "row", gap: 14, marginTop: 14 }}>
          <Metric label="Reports" value={String(actions.length)} onHero />
          <Metric label="League" value={data?.myRow ? `#${data.myRow.rank}` : "—"} onHero />
          <Metric label="GW" value={data ? String(data.gameweek) : "—"} onHero />
        </View>
      </Hero>

      {error ? (
        <Surface style={{ borderColor: theme.error }}>
          <Text style={{ color: theme.error, fontSize: 12 }}>{String((error as Error).message)}</Text>
        </Surface>
      ) : null}

      {actions.map((label) => (
        <Pressable
          key={label}
          disabled={!data || !!running}
          onPress={() => run(label)}
          style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, borderRadius: 15, padding: 13, marginBottom: 9 }}
        >
          {running === label ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: theme.background, alignItems: "center", justifyContent: "center", marginRight: 11 }}>
              <Text style={{ color: theme.accent, fontSize: 21 }}>›</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.foreground, fontSize: 13, fontWeight: "800", letterSpacing: 0.6 }}>{label}</Text>
            <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
              {label === "FULL UPDATE" ? "Refresh and share a complete decision snapshot." : label === "STATUS" ? "Share live connection, GW and league status." : `Share the ${label.toLowerCase()} intelligence report.`}
            </Text>
          </View>
          <Text style={{ color: theme.accent, fontSize: 20 }}>›</Text>
        </Pressable>
      ))}

      <Surface style={{ backgroundColor: theme.surfaceAlt }}>
        <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 14 }}>Your account stays safe</Text>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
          DGH War Room never makes transfers or changes on your behalf — every recommendation is yours to act on. If your squad can&apos;t be verified, recommendations are paused until it can.
        </Text>
      </Surface>
    </Page>
  );
}
