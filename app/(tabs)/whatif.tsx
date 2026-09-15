import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { useSavedWhatIf } from "../../hooks/useSavedWhatIf";
import { simulateWhatIf } from "../../lib/analytics/whatIf";
import type { WhatIfMove, WhatIfChipChoice } from "../../lib/analytics/whatIf";
import type { SavedWhatIfScenario } from "../../lib/savedWhatIfStore";
import { buildRivalImpacts } from "../../lib/analytics/transferEngine";
import { projectNextGw } from "../../lib/analytics/projection";
import { LoadingShell, ErrorBlock, FreshnessBanner } from "../../components/StatusStates";
import { Page, Header, Surface, Hero, Metric, Pill, Section, Row } from "../../components/Premium";

const CHIPS: { key: WhatIfChipChoice; label: string }[] = [
  { key: "none", label: "None" },
  { key: "bboost", label: "Bench Boost" },
  { key: "3xc", label: "Triple Captain" },
  { key: "wildcard", label: "Wildcard" },
  { key: "freehit", label: "Free Hit" },
];

export default function WhatIfScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { setRefreshing(true); try { await refetch(); } finally { setRefreshing(false); } };
  const { scenarios, isLoading: scenariosLoading, saveScenario, deleteScenario } = useSavedWhatIf();
  const [moves, setMoves] = useState<WhatIfMove[]>([]);
  const [chip, setChip] = useState<WhatIfChipChoice>("none");
  const [pendingOutId, setPendingOutId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [saveNameDraft, setSaveNameDraft] = useState("");
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [showSavedList, setShowSavedList] = useState(false);

  const usedOutIds = useMemo(() => new Set(moves.map((m) => m.outPlayerId)), [moves]);
  const usedInIds = useMemo(() => new Set(moves.map((m) => m.inPlayerId)), [moves]);
  const pendingOutPlayer = useMemo(() => data?.mySquad.find((p) => p.playerId === pendingOutId) ?? null, [data, pendingOutId]);

  const candidates = useMemo(() => {
    if (!data || !pendingOutPlayer) return [];
    let pool = data.playerPool.filter(
      (p) => p.position === pendingOutPlayer.player.position && !data.mySquad.some((sq) => sq.playerId === p.id) && !usedInIds.has(p.id),
    );
    if (search.trim()) pool = pool.filter((p) => p.webName.toLowerCase().includes(search.toLowerCase()));
    return pool.sort((a, b) => projectNextGw(b) - projectNextGw(a)).slice(0, 25);
  }, [data, pendingOutPlayer, usedInIds, search]);

  // Wildcard/Free Hit waive transfer hits entirely — reflect that here without
  // changing the shared engine's semantics for every other screen that calls it.
  const effectiveFreeTransfers = useMemo(() => {
    if (!data) return 0;
    if (chip === "wildcard" || chip === "freehit") return 5;
    return data.freeTransfers;
  }, [data, chip]);

  const result = useMemo(() => {
    if (!data) return null;
    return simulateWhatIf({ currentSquad: data.mySquad, playerPool: data.playerPool, bank: data.bank, freeTransfers: effectiveFreeTransfers, moves, chip });
  }, [data, moves, chip, effectiveFreeTransfers]);

  const impacts = useMemo(() => {
    if (!data || !result || !result.valid || !moves.length) return [];
    const myCurrentTotal = data.myRow?.dghTotalPoints ?? data.myRow?.total ?? 0;
    const myProjectedTotal = myCurrentTotal + result.netSwing;
    return buildRivalImpacts(myProjectedTotal, myCurrentTotal, data.myRow?.dghRank ?? data.myRow?.rank ?? 999, data.rivals);
  }, [data, result, moves.length]);

  if (isLoading) return <LoadingShell label="Loading your squad for simulation…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Unknown error")} onRetry={() => refetch()} />;

  const sellablePlayers = data.mySquad.filter((p) => !usedOutIds.has(p.playerId));

  const addMove = (inPlayerId: number) => {
    if (pendingOutId == null) return;
    setMoves((prev) => [...prev, { outPlayerId: pendingOutId, inPlayerId }]);
    setPendingOutId(null);
    setSearch("");
  };
  const removeMove = (idx: number) => setMoves((prev) => prev.filter((_, i) => i !== idx));
  const resetAll = () => {
    setMoves([]);
    setChip("none");
    setPendingOutId(null);
    setSearch("");
  };

  const loadScenario = (scenario: SavedWhatIfScenario) => {
    setMoves(scenario.moves);
    setChip(scenario.chip);
    setPendingOutId(null);
    setSearch("");
    setShowSavedList(false);
  };

  const confirmSave = async () => {
    if (!result || !moves.length) return;
    await saveScenario({
      name: saveNameDraft,
      moves,
      chip,
      snapshot: {
        netSwing: result.netSwing,
        scenarioGwAdjusted: result.scenarioGwAdjusted,
        transferHits: result.transferHits,
        moveSummaries: result.moves.map((m) => `${m.outName} → ${m.inName}`),
      },
    });
    setSaveNameDraft("");
    setShowSavePrompt(false);
  };

  const confirmDelete = (scenario: SavedWhatIfScenario) => {
    Alert.alert("Delete scenario", `Remove "${scenario.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void deleteScenario(scenario.id) },
    ]);
  };

  return (
    <Page refreshing={refreshing} onRefresh={() => void doRefresh()}>
      <Header eyebrow="WHAT-IF SIMULATOR" title="Try a Transfer" subtitle="Nothing here touches your real FPL team — pure simulation" />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Hero variant="navy">
        <Pill label="SIMULATED — NOT SUBMITTED" tone="onHero" />
        <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "900", marginTop: 10 }}>{result ? `${result.scenarioGwAdjusted.toFixed(1)} pts` : "—"}</Text>
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, marginTop: 3 }}>
          {result && moves.length ? `${result.netSwing >= 0 ? "+" : ""}${result.netSwing.toFixed(1)} vs. your current squad` : "Baseline — your current squad, no changes"}
        </Text>
        <View style={{ flexDirection: "row", gap: 14, marginTop: 14 }}>
          <Metric label="Hit" value={result?.transferHits ? `-${result.transferHits}` : "FREE"} onHero />
          <Metric label="Net bank" value={result && moves.length ? `${result.netBankChange >= 0 ? "+" : "−£"}${result.netBankChange >= 0 ? "£" : ""}${Math.abs(result.netBankChange).toFixed(1)}m` : "—"} onHero />
          <Metric label="Bank after" value={result ? `£${result.bankAfter.toFixed(1)}m` : "—"} onHero />
        </View>
        {moves.length > 1 ? (
          <Text style={{ color: "rgba(255,255,255,0.86)", fontSize: 11, marginTop: 10 }}>
            {moves.length} moves evaluated as one scenario · hit counted once across the full set · see below for the breakdown.
          </Text>
        ) : null}
      </Hero>

      {result && !result.valid ? (
        <Surface style={{ borderColor: theme.error }}>
          <Text style={{ color: theme.error, fontSize: 12 }}>{result.error}</Text>
        </Surface>
      ) : null}

      <Section title={`Your moves (${moves.length})`} action={moves.length || chip !== "none" ? <Pressable onPress={resetAll}><Text style={{ color: theme.error, fontSize: 11, fontWeight: "800" }}>RESET</Text></Pressable> : undefined} />
      {moves.length === 0 ? (
        <Surface>
          <Text style={{ color: theme.muted, fontSize: 12 }}>No moves yet — pick a player below to sell.</Text>
        </Surface>
      ) : (
        <Surface>
          {moves.map((move, i) => {
            const detail = result?.moves[i];
            return (
              <View key={`${move.outPlayerId}-${move.inPlayerId}-${i}`} style={{ paddingVertical: 9, borderBottomWidth: i === moves.length - 1 ? 0 : 1, borderBottomColor: theme.border }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.foreground, fontWeight: "700", fontSize: 13 }}>
                      {detail?.outName ?? `Player #${move.outPlayerId}`} → {detail?.inName ?? `Player #${move.inPlayerId}`}
                    </Text>
                    <Text style={{ color: detail?.valid === false ? theme.error : (detail?.delta ?? 0) >= 0 ? theme.success : theme.error, fontSize: 11, marginTop: 2 }}>
                      {detail?.valid === false ? detail.error : `${(detail?.delta ?? 0) >= 0 ? "+" : ""}${(detail?.delta ?? 0).toFixed(1)} pts/GW`}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeMove(i)}>
                    <Text style={{ color: theme.error, fontSize: 18 }}>×</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </Surface>
      )}

      {moves.length > 1 && result ? (
        <Surface style={{ marginTop: 8, borderColor: theme.primary }}>
          <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 13 }}>Combined transfer package</Text>
          <Row label="Transfers" value={String(result.transfersMade)} />
          <Row label="Starting bank" value={`£${(result.bankAfter - result.netBankChange).toFixed(1)}m`} />
          <Row label="Net bank change" value={`${result.netBankChange >= 0 ? "+" : "−£"}${result.netBankChange >= 0 ? "£" : ""}${Math.abs(result.netBankChange).toFixed(1)}m`} />
          <Row label="Bank after transfers" value={`£${result.bankAfter.toFixed(1)}m`} />
          <Row label="Raw swap delta (pre-optimization)" value={`${result.transferNetDelta >= 0 ? "+" : ""}${result.transferNetDelta.toFixed(1)} pts/GW`} />
          <Row label="Transfer hit" value={result.transferHits ? `-${result.transferHits} pts` : "FREE"} />
          <Row label="NET SCENARIO GAIN/LOSS (after optimized XI)" value={`${result.netSwing >= 0 ? "+" : ""}${result.netSwing.toFixed(1)} pts/GW`} emphasis />
          <Text style={{ color: theme.muted, fontSize: 10, marginTop: 5 }}>
            All selected moves are evaluated as one scenario. Money is aggregated across the full transfer package and the hit is applied once. The raw swap delta is the sum of individual player deltas
            before re-optimizing the XI/captain — it is a diagnostic only. The NET SCENARIO figure above (same number shown at the top of this screen) is the single authoritative result: it already
            accounts for the hit, any chip effect, and any captain/bench changes the optimizer makes.
          </Text>
        </Surface>
      ) : null}

      <Section
        title={`Saved scenarios (${scenarios.length})`}
        action={
          <View style={{ flexDirection: "row", gap: 14 }}>
            {moves.length ? (
              <Pressable onPress={() => setShowSavePrompt((s) => !s)}>
                <Text style={{ color: theme.primary, fontSize: 11, fontWeight: "800" }}>{showSavePrompt ? "CANCEL" : "SAVE THIS"}</Text>
              </Pressable>
            ) : undefined}
            {scenarios.length ? (
              <Pressable onPress={() => setShowSavedList((s) => !s)}>
                <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "800" }}>{showSavedList ? "HIDE" : "VIEW ALL"}</Text>
              </Pressable>
            ) : undefined}
          </View>
        }
      />
      {showSavePrompt && moves.length ? (
        <Surface style={{ borderColor: theme.primary }}>
          <Text style={{ color: theme.muted, fontSize: 10, fontWeight: "800", marginBottom: 6 }}>NAME THIS SCENARIO</Text>
          <TextInput
            placeholder="e.g. GW12 double up on City"
            placeholderTextColor={theme.muted}
            value={saveNameDraft}
            onChangeText={setSaveNameDraft}
            style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: theme.foreground, marginBottom: 8 }}
          />
          <Pressable onPress={() => void confirmSave()} style={{ minHeight: 42, borderRadius: 10, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: theme.background, fontWeight: "900", fontSize: 12 }}>SAVE SCENARIO</Text>
          </Pressable>
        </Surface>
      ) : null}
      {!scenariosLoading && scenarios.length === 0 ? (
        <Surface>
          <Text style={{ color: theme.muted, fontSize: 12 }}>No saved scenarios yet — build a move set above and tap &quot;Save this&quot; to keep it for later.</Text>
        </Surface>
      ) : null}
      {showSavedList
        ? scenarios.map((s) => (
            <Surface key={s.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 13 }}>{s.name}</Text>
                  <Text style={{ color: theme.muted, fontSize: 10, marginTop: 2 }}>{s.snapshot.moveSummaries.join(" · ") || "No moves"} · {s.chip !== "none" ? s.chip.toUpperCase() : "no chip"}</Text>
                  <Text style={{ color: s.snapshot.netSwing >= 0 ? theme.success : theme.error, fontSize: 12, fontWeight: "800", marginTop: 4 }}>
                    {s.snapshot.netSwing >= 0 ? "+" : ""}{s.snapshot.netSwing.toFixed(1)} pts/GW at save time
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Pressable onPress={() => loadScenario(s)}>
                    <Text style={{ color: theme.primary, fontSize: 11, fontWeight: "800" }}>LOAD</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(s)}>
                    <Text style={{ color: theme.error, fontSize: 11, fontWeight: "800" }}>DELETE</Text>
                  </Pressable>
                </View>
              </View>
            </Surface>
          ))
        : null}

      {moves.length < 5 && pendingOutId == null ? (
        <>
          <Section title="Pick a player to sell" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
            {sellablePlayers.map((p) => (
              <Pressable key={p.playerId} onPress={() => setPendingOutId(p.playerId)} style={{ width: 108, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 10 }}>
                <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
                  {p.player.webName}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 10, marginTop: 3 }}>
                  {p.player.position} · £{p.player.price}m
                </Text>
                <Text style={{ color: theme.primary, fontSize: 10, marginTop: 3, fontWeight: "700" }}>{projectNextGw(p.player).toFixed(1)} pts proj.</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {pendingOutId != null ? (
        <>
          <Section
            title={`Replace ${pendingOutPlayer?.player.webName ?? ""} (${pendingOutPlayer?.player.position ?? ""})`}
            action={
              <Pressable
                onPress={() => {
                  setPendingOutId(null);
                  setSearch("");
                }}
              >
                <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "800" }}>CANCEL</Text>
              </Pressable>
            }
          />
          <TextInput
            placeholder="Search players…"
            placeholderTextColor={theme.muted}
            value={search}
            onChangeText={setSearch}
            style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: theme.foreground, marginBottom: 8 }}
          />
          <Surface>
            {candidates.length === 0 ? <Text style={{ color: theme.muted, fontSize: 12 }}>No affordable, legal replacements found.</Text> : null}
            {candidates.map((c, i) => (
              <Pressable key={c.id} onPress={() => addMove(c.id)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderBottomWidth: i === candidates.length - 1 ? 0 : 1, borderBottomColor: theme.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.foreground, fontWeight: "700", fontSize: 13 }}>{c.webName}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
                    {c.teamShort} · £{c.price}m · {c.availability.confidence}
                  </Text>
                </View>
                <Text style={{ color: theme.primary, fontWeight: "900", fontSize: 13 }}>{projectNextGw(c).toFixed(1)}</Text>
              </Pressable>
            ))}
          </Surface>
        </>
      ) : null}

      <Section title="Chip" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
        {CHIPS.map((c) => (
          <Pressable key={c.key} onPress={() => setChip(c.key)} style={{ backgroundColor: chip === c.key ? theme.primary : theme.surfaceAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: chip === c.key ? theme.background : theme.foreground, fontWeight: "700", fontSize: 12 }}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {result?.valid && moves.length ? (
        <>
          <Section title="Impact on rivals" />
          <Surface>
            {impacts.slice(0, 6).map((r) => (
              <View key={r.entryId} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.foreground, fontWeight: "700", fontSize: 12 }}>{r.managerName}</Text>
                  <Text style={{ color: theme.muted, fontSize: 10 }}>beat probability</Text>
                </View>
                <Text style={{ color: r.winProbabilityThisGw >= 0.5 ? theme.success : theme.error, fontSize: 15, fontWeight: "900" }}>{Math.round(r.winProbabilityThisGw * 100)}%</Text>
              </View>
            ))}
          </Surface>
        </>
      ) : null}

      {result?.valid ? (
        <Surface>
          <Row label="Formation" value={result.formation} />
          <Row label="Free transfers used" value={String(result.freeTransfersUsed)} />
          <Row label="Paid transfers" value={String(result.paidTransfers)} />
          {chip === "bboost" ? <Row label="Bench boost points" value={`+${result.bbBenchPoints}`} /> : null}
          {chip === "3xc" ? <Row label="Triple captain extra" value={`+${result.tcExtraPoints}`} /> : null}
        </Surface>
      ) : null}

      <Surface style={{ backgroundColor: theme.surfaceAlt }}>
        <Text style={{ color: theme.foreground, fontWeight: "800" }}>How this works</Text>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
          This is a pure simulation — it never submits anything to your real FPL account. Build moves, review the projected impact, and only make the transfer in the official FPL app once you are happy with it.
        </Text>
      </Surface>
    </Page>
  );
}
