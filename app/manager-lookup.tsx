import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { useWarRoomData } from "../hooks/useWarRoomData";
import { LoadingShell, ErrorBlock } from "../components/StatusStates";
import { Page, Header, Surface, Section, Row, Pill, Hero, Metric } from "../components/Premium";
import { PlayingStatusBadge } from "../components/PlayingStatusBadge";
import { getPlayingStatus } from "../lib/analytics/liveStatus";
import {
  lookupManagerProfile,
  getRecentManagerLookups,
  pushRecentManagerLookup,
  ManagerLookupError,
  type ManagerProfile,
} from "../lib/managerLookupService";

export default function ManagerLookupScreen() {
  const { theme } = useTheme();
  const { data, isLoading: warRoomLoading, isError, error, refetch } = useWarRoomData();

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<ManagerProfile | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ entryId: number; managerName: string; teamName: string }[]>([]);

  useEffect(() => {
    void getRecentManagerLookups().then(setRecent);
  }, []);

  const runLookup = async (idOverride?: number) => {
    if (!data) return;
    const entryId = idOverride ?? Number(query.trim());
    if (!Number.isFinite(entryId) || entryId <= 0) {
      setLookupError("Enter a valid numeric FPL entry ID (found in the URL of any manager's FPL page).");
      return;
    }
    setBusy(true);
    setLookupError(null);
    setProfile(null);
    try {
      const result = await lookupManagerProfile(entryId, data.playerIndex, data.liveResponse, data.gameweek);
      setProfile(result);
      await pushRecentManagerLookup({ entryId: result.entryId, managerName: result.managerName, teamName: result.teamName });
      setRecent(await getRecentManagerLookups());
    } catch (err) {
      if (err instanceof ManagerLookupError) setLookupError(err.message);
      else setLookupError(String((err as Error)?.message ?? "Lookup failed."));
    } finally {
      setBusy(false);
    }
  };

  if (warRoomLoading) return <LoadingShell label="Loading…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Data unavailable")} onRetry={() => refetch()} />;

  return (
    <Page>
      <Header eyebrow="SCOUT ANYONE" title="Manager Lookup" subtitle="Look up any FPL manager by entry ID — not limited to your mini-league." />

      <Surface>
        <Text style={{ color: theme.muted, fontSize: 10, marginBottom: 8 }}>
          Find an entry ID from the URL of any manager&apos;s public FPL team page (the number after /entry/).
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. 871842"
            placeholderTextColor={theme.muted}
            keyboardType="number-pad"
            onSubmitEditing={() => void runLookup()}
            style={{ flex: 1, backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: theme.foreground, fontSize: 14, fontWeight: "700" }}
          />
          <Pressable
            onPress={() => void runLookup()}
            disabled={busy}
            style={{ minWidth: 90, borderRadius: 10, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }}
          >
            {busy ? <ActivityIndicator color={theme.background} /> : <Text style={{ color: theme.background, fontWeight: "900" }}>SEARCH</Text>}
          </Pressable>
        </View>
        {lookupError ? <Text style={{ color: theme.error, fontSize: 11, marginTop: 8 }}>{lookupError}</Text> : null}
      </Surface>

      {recent.length > 0 ? (
        <>
          <Section title="Recent lookups" />
          <Surface>
            {recent.map((r, i) => (
              <Pressable
                key={r.entryId}
                onPress={() => void runLookup(r.entryId)}
                style={{ paddingVertical: 8, borderBottomWidth: i === recent.length - 1 ? 0 : 1, borderBottomColor: theme.border + "80", flexDirection: "row", justifyContent: "space-between" }}
              >
                <Text style={{ color: theme.foreground, fontSize: 12, fontWeight: "700" }}>{r.managerName}</Text>
                <Text style={{ color: theme.muted, fontSize: 11 }}>{r.teamName} · #{r.entryId}</Text>
              </Pressable>
            ))}
          </Surface>
        </>
      ) : null}

      {profile ? (
        <>
          <Hero variant="navy">
            <Pill label={`ENTRY #${profile.entryId}`} tone="onHero" />
            <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900", marginTop: 10 }}>{profile.managerName}</Text>
            <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 12, marginTop: 2 }}>{profile.teamName}</Text>
            <View style={{ flexDirection: "row", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
              <Metric label="Overall rank" value={`#${profile.overallRank.toLocaleString()}`} onHero />
              <Metric label="Total points" value={String(profile.overallPoints)} onHero />
              <Metric label={`GW${profile.currentEvent}`} value={String(profile.currentEventPoints)} onHero />
              <Metric label="Team value" value={`£${profile.teamValue.toFixed(1)}m`} onHero />
              <Metric label="Bank" value={`£${profile.bank.toFixed(1)}m`} onHero />
            </View>
          </Hero>

          {profile.chipsUsed.length > 0 ? (
            <>
              <Section title="Chips used this season" />
              <Surface>
                {profile.chipsUsed.map((c, i) => (
                  <Row key={i} label={c.name.replace(/_/g, " ").toUpperCase()} value={`GW${c.event}`} />
                ))}
              </Surface>
            </>
          ) : null}

          <Section title="Rank history" />
          <Surface>
            {profile.rankHistory.length === 0 ? (
              <Text style={{ color: theme.muted, fontSize: 11 }}>No gameweek history available yet.</Text>
            ) : (
              [...profile.rankHistory].reverse().slice(0, 10).map((r) => (
                <Row key={r.event} label={`GW${r.event}`} value={`${r.points} pts · rank ${r.overallRank.toLocaleString()}`} />
              ))
            )}
          </Surface>

          {profile.pastSeasons.length > 0 ? (
            <>
              <Section title="Past seasons" />
              <Surface>
                {profile.pastSeasons.map((s) => (
                  <Row key={s.seasonName} label={s.seasonName} value={`${s.totalPoints} pts · rank ${s.rank.toLocaleString()}`} />
                ))}
              </Surface>
            </>
          ) : null}

          <Section title={`Current squad (GW${data.gameweek})`} />
          {profile.squadFetchFailed || !profile.currentSquad ? (
            <Surface style={{ borderColor: theme.error }}>
              <Text style={{ color: theme.error, fontSize: 12 }}>
                This manager&apos;s squad is private or this gameweek&apos;s picks aren&apos;t published yet.
              </Text>
            </Surface>
          ) : (
            <Surface>
              {profile.currentSquad.map((p) => (
                <View key={p.playerId} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                    <PlayingStatusBadge status={getPlayingStatus(p, data.fixtures, data.gameweek)} compact />
                    <Text style={{ color: theme.foreground, fontSize: 13, marginLeft: 8, fontWeight: p.isCaptain ? "800" : "400" }}>
                      {p.player.webName} {p.isCaptain ? "(C)" : p.isViceCaptain ? "(VC)" : ""}
                    </Text>
                  </View>
                  <Text style={{ color: p.isBench ? theme.muted : theme.foreground, fontSize: 11 }}>
                    {p.player.position} · {p.isBench ? "BENCH" : "XI"}
                  </Text>
                </View>
              ))}
            </Surface>
          )}

          {data.rivals.some((r) => r.entryId === profile.entryId) ? (
            <Pressable
              onPress={() => router.push(`/rival/${profile.entryId}` as any)}
              style={{ minHeight: 44, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: theme.background, fontSize: 12, fontWeight: "900" }}>OPEN FULL RIVAL SCOUT VIEW</Text>
            </Pressable>
          ) : (
            <Surface style={{ backgroundColor: theme.surfaceAlt }}>
              <Text style={{ color: theme.muted, fontSize: 10 }}>
                This manager isn&apos;t in your configured mini-league, so the deeper rival-scout analysis (fixture
                weaknesses, DGH Spy predictions) isn&apos;t available for them — only their public squad and history above.
              </Text>
            </Surface>
          )}
        </>
      ) : null}
    </Page>
  );
}
