import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { useWarRoomData } from "../hooks/useWarRoomData";
import { LoadingShell, ErrorBlock, FreshnessBanner, EmptyBlock } from "../components/StatusStates";
import { Page, Header, Surface, Section, Pill, Row } from "../components/Premium";
import type { TemplatePlayer } from "../lib/analytics/miniLeagueTemplate";
import { UTI_PROGRESSION_HIGH_TO_LOW, UTI_BANDS } from "../lib/analytics/uti";

const POSITION_ORDER = ["GKP", "DEF", "MID", "FWD"] as const;

function PlayerRow({ p, theme }: { p: TemplatePlayer; theme: any }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36, borderBottomWidth: 1, borderBottomColor: theme.border + "80" }}>
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 8 }}>
        <View style={{ width: 34, height: 22, borderRadius: 6, backgroundColor: theme.surfaceAlt, alignItems: "center", justifyContent: "center", marginRight: 8 }}>
          <Text style={{ color: theme.muted, fontSize: 9, fontWeight: "900" }}>{p.position}</Text>
        </View>
        <Text style={{ color: theme.foreground, fontSize: 13, fontWeight: "800" }} numberOfLines={1}>
          {p.webName}
          {p.captainCount > 0 ? <Text style={{ color: theme.primary }}> (C×{p.captainCount})</Text> : null}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 11, marginLeft: 6 }}>{p.teamShort}</Text>
      </View>
      <Text style={{ color: theme.primary, fontSize: 13, fontWeight: "900" }}>{p.ownershipPct}%</Text>
    </View>
  );
}

export default function MiniLeagueTemplateScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();

  const grouped = useMemo(() => {
    if (!data) return [];
    return POSITION_ORDER.map((pos) => ({ pos, players: data.miniLeagueTemplate.xi.filter((p) => p.position === pos) })).filter((g) => g.players.length);
  }, [data]);

  const bench = useMemo(() => {
    if (!data) return [];
    const xiIds = new Set(data.miniLeagueTemplate.xi.map((p) => p.playerId));
    return data.miniLeagueTemplate.fullTemplateSquad.filter((p) => !xiIds.has(p.playerId));
  }, [data]);

  const similarity = useMemo(() => {
    if (!data) return [];
    return [...data.templateSimilarity].sort((a, b) => b.squadSimilarityPct - a.squadSimilarityPct);
  }, [data]);

  const uti = useMemo(() => data?.uti ?? [], [data]);

  if (isLoading) return <LoadingShell label="Building the mini-league template team…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Template data unavailable")} onRetry={() => refetch()} />;

  const template = data.miniLeagueTemplate;

  return (
    <Page>
      <Header
        eyebrow="MINI-LEAGUE INTEL"
        title="Template Team"
        subtitle="The most-owned legal XI across every verified squad in your league — and how closely each manager actually plays it."
        right={<Pill label={template.formation === "N/A" ? "N/A" : template.formation} tone="primary" />}
      />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Surface>
        <Row label="Verified squads" value={`${template.verifiedManagerCount} / ${template.totalManagerCount}`} />
        <Row label="Formation" value={template.formation} />
      </Surface>

      {template.formation === "N/A" ? (
        <EmptyBlock message="Not enough verified squads this refresh to build a legal template XI." />
      ) : (
        <>
          <Section title="Template XI" />
          <Surface>
            {grouped.map((g) => (
              <View key={g.pos}>
                {g.players.map((p) => (
                  <PlayerRow key={p.playerId} p={p} theme={theme} />
                ))}
              </View>
            ))}
          </Surface>

          {bench.length > 0 ? (
            <>
              <Section title="Template bench" />
              <Surface>
                {bench.map((p) => (
                  <PlayerRow key={p.playerId} p={p} theme={theme} />
                ))}
              </Surface>
            </>
          ) : null}
        </>
      )}

      <Section title="Unified Template Index (UTI)" />
      {uti.length === 0 ? (
        <EmptyBlock message="No verified squads to compare this refresh." />
      ) : (
        <>
          <Surface>
            <Text style={{ color: theme.muted, fontSize: 10, lineHeight: 15 }}>
              UTI = 0.60 × TTS (this squad vs. the league-wide template) + 0.40 × average FTSI (this squad vs. every
              other manager, pairwise). Higher = more template-like. See breakdown per manager below.
            </Text>
          </Surface>
          <Surface>
            {uti.map((m, i) => (
              <Pressable
                key={m.entryId}
                disabled={m.isMe}
                onPress={() => router.push(`/rival/${m.entryId}`)}
                style={{
                  paddingVertical: 10,
                  borderBottomWidth: i === uti.length - 1 ? 0 : 1,
                  borderBottomColor: theme.border + "80",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: m.isMe ? theme.primary : theme.foreground, fontSize: 13, fontWeight: "900" }} numberOfLines={1}>
                      {m.isMe ? "You" : m.managerName}
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 11 }} numberOfLines={1}>
                      {m.teamName} · TTS {m.tts.tts} · avg FTSI {m.avgFtsi}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: theme.foreground, fontSize: 15, fontWeight: "900" }}>{m.uti}</Text>
                    <Pill label={`${m.band.emoji} ${m.band.label}`} tone={i === 0 ? "primary" : "neutral"} />
                  </View>
                </View>
              </Pressable>
            ))}
          </Surface>
          <Surface style={{ backgroundColor: theme.surfaceAlt }}>
            <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 12, marginBottom: 6 }}>
              Grading scale
            </Text>
            {UTI_PROGRESSION_HIGH_TO_LOW.map((key) => {
              const band = UTI_BANDS.find((b) => b.key === key)!;
              return (
                <Row
                  key={key}
                  label={`${band.emoji} ${band.label}`}
                  value={band.max === null ? `>${band.min - 0.0001}` : `${band.min}–${band.max}`}
                />
              );
            })}
          </Surface>
        </>
      )}

      <Section title="Manager similarity to the template" />
      {similarity.length === 0 ? (
        <EmptyBlock message="No verified squads to compare this refresh." />
      ) : (
        <Surface>
          {similarity.map((m, i) => (
            <Pressable
              key={m.entryId}
              disabled={m.isMe}
              onPress={() => router.push(`/rival/${m.entryId}`)}
              style={{
                paddingVertical: 10,
                borderBottomWidth: i === similarity.length - 1 ? 0 : 1,
                borderBottomColor: theme.border + "80",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: m.isMe ? theme.primary : theme.foreground, fontSize: 13, fontWeight: "900" }} numberOfLines={1}>
                    {m.isMe ? "You" : m.managerName}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }} numberOfLines={1}>
                    {m.teamName}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: theme.foreground, fontSize: 15, fontWeight: "900" }}>{m.squadSimilarityPct}%</Text>
                  <Text style={{ color: theme.muted, fontSize: 10 }}>squad · {m.xiSimilarityPct}% XI</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </Surface>
      )}
    </Page>
  );
}
