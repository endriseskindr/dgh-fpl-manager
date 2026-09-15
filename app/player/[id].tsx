import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { useWatchlist } from "../../hooks/useWatchlist";
import { fpl } from "../../lib/fplClient";
import { ErrorBlock, LoadingShell } from "../../components/StatusStates";
import { WatchlistStar } from "../../components/WatchlistStar";
import { PointsSparkline } from "../../components/PointsSparkline";
import { Page, Header, Surface, Hero, Metric, Pill, Section, Row } from "../../components/Premium";
import { playerDghMetrics } from "../../lib/analytics/dghMetrics";

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const { isStarred, toggle } = useWatchlist();

  const player = useMemo(() => data?.playerIndex.get(Number(id)) ?? null, [data, id]);

  const summaryQuery = useQuery({
    queryKey: ["element-summary", player?.id],
    queryFn: () => fpl.elementSummary(player!.id),
    enabled: !!player,
    staleTime: 60_000,
  });

  const dghPlayer = useMemo(() => {
    if (!player) return null;
    const history = summaryQuery.data?.data?.history ?? [];
    const recent = history.slice(-5);
    const recentHaulPct = recent.length ? (recent.filter((h: any) => Number(h.total_points ?? 0) >= 10).length / recent.length) * 100 : undefined;
    const xgiValues = recent.map((h: any) => Number(h.expected_goal_involvements ?? 0)).filter((v: number) => Number.isFinite(v));
    const xgiMean = xgiValues.length ? xgiValues.reduce((a: number, b: number) => a + b, 0) / xgiValues.length : 0;
    const xgiSd = xgiValues.length > 1 ? Math.sqrt(xgiValues.reduce((s: number, v: number) => s + (v - xgiMean) ** 2, 0) / xgiValues.length) : undefined;
    const xgiVolatility = xgiSd == null ? undefined : Math.min(100, (xgiSd / Math.max(0.05, xgiMean)) * 100);
    return playerDghMetrics(player, { recentHaulPct, xgiVolatility, explosivenessIndex: recentHaulPct == null ? undefined : recentHaulPct / 100 });
  }, [player, summaryQuery.data]);

  if (isLoading) return <LoadingShell label="Loading player…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Unknown error")} onRetry={() => refetch()} />;
  if (!player) return <ErrorBlock message="Player not found." />;

  return (
    <Page>
      <Header
        eyebrow={`${player.teamShort} · ${player.position}`}
        title={player.fullName}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <WatchlistStar starred={isStarred(player.id)} onPress={() => toggle(player.id)} />
            <Pressable onPress={() => router.push(`/compare?a=${player.id}` as any)}>
              <Pill label="COMPARE" tone="primary" />
            </Pressable>
          </View>
        }
      />

      <Hero variant="green">
        <Pill label={player.availability.confidence} tone="onHero" />
        <Text style={{ color: "#FFFFFF", fontSize: 30, fontWeight: "900", marginTop: 10 }}>£{player.price}m</Text>
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, marginTop: 3 }}>
          {player.availability.news ? player.availability.news : "No official news flagged"}
        </Text>
        <View style={{ flexDirection: "row", gap: 14, marginTop: 14 }}>
          <Metric label="Form" value={player.form.toFixed(1)} onHero />
          <Metric label="PPG" value={player.pointsPerGame.toFixed(1)} onHero />
          <Metric label="Ownership" value={`${player.ownershipPct}%`} onHero />
        </View>
      </Hero>

      <Section title="Points history" />
      <Surface>
        {summaryQuery.isLoading ? (
          <Text style={{ color: theme.muted, fontSize: 11 }}>Loading points history…</Text>
        ) : summaryQuery.isError || !summaryQuery.data ? (
          <Text style={{ color: theme.muted, fontSize: 11 }}>Points history unavailable this refresh.</Text>
        ) : (
          <PointsSparkline history={summaryQuery.data.data.history} theme={theme} />
        )}
      </Surface>

      <Section title="DGH Decision Metrics" />
      <Surface>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Metric label="HSFI" value={dghPlayer?.hsfi.toFixed(1) ?? "—"} />
          <Metric label="WCS" value={dghPlayer?.wcs.toFixed(1) ?? "—"} />
          <Metric label="MDI" value={dghPlayer?.mdi.toFixed(2) ?? "—"} />
          <Metric label="DTQ" value={dghPlayer?.dtq.toFixed(1) ?? "—"} />
          <Metric label="WCPS" value={dghPlayer?.wcps.toFixed(1) ?? "—"} />
          <Metric label="BV" value={dghPlayer?.bv.toFixed(2) ?? "—"} />
        </View>
        <Row label="DGH ownership" value={`${player.ownershipPct}%`} />
        <Row label="Fixture FDR" value={dghPlayer?.fixtureFdr.toFixed(1) ?? "—"} />
        <Text style={{ color: theme.muted, fontSize: 10, marginTop: 7 }}>WCS uses the player&apos;s loaded last-five-GW history when available.</Text>
      </Surface>

      <Section title="Availability" />
      <Surface>
        <Row
          label="Chance next round"
          value={player.availability.chanceNextRound !== null ? `${player.availability.chanceNextRound}%` : "Not flagged (assumed fit)"}
        />
      </Surface>

      <Section title="Form & underlying stats" />
      <Surface>
        <Row label="Form" value={player.form.toFixed(1)} />
        <Row label="Points per game" value={player.pointsPerGame.toFixed(1)} />
        <Row label="Total points" value={String(player.totalPoints)} />
        <Row label="Minutes" value={String(player.minutes)} />
        <Row label="xG" value={player.xG.toFixed(2)} />
        <Row label="xA" value={player.xA.toFixed(2)} />
        <Row label="xGI" value={player.xGI.toFixed(2)} />
        <Row label="ICT Index" value={player.ictIndex.toFixed(1)} />
        <Row label="Bonus" value={String(player.bonus)} />
        <Row label="BPS" value={String(player.bps)} />
      </Surface>

      <Section title="Ownership & price" />
      <Surface>
        <Row label="Ownership %" value={`${player.ownershipPct}%`} />
        <Row label="Transfers in (GW)" value={String(player.transfersInEvent)} />
        <Row label="Transfers out (GW)" value={String(player.transfersOutEvent)} />
        <Row label="Price change (GW)" value={`£${player.priceChangeEvent.toFixed(1)}m`} />
      </Surface>
    </Page>
  );
}
