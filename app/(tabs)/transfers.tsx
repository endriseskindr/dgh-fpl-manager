import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { useWatchlist } from "../../hooks/useWatchlist";
import { buildTransferScenarios, buildRivalImpacts } from "../../lib/analytics/transferEngine";
import { buildFixtureRunLookup } from "../../lib/analytics/rivalIntel";
import { multiGwValueScore } from "../../lib/analytics/multiGwHorizon";
import { projectNextGw } from "../../lib/analytics/projection";
import { LoadingShell, ErrorBlock, FreshnessBanner } from "../../components/StatusStates";
import { WatchlistStar } from "../../components/WatchlistStar";
import { Page, Header, Surface, Hero, Metric, Section, Pill, Row } from "../../components/Premium";

export default function TransfersScreen(){
 const {theme}=useTheme(); const {data,isLoading,isError,error,refetch}=useWarRoomData(); const [active,setActive]=useState(0); const [refreshing,setRefreshing]=useState(false);
 const doRefresh=async()=>{setRefreshing(true);try{await refetch()}finally{setRefreshing(false)}};
 const {watchlistIds,isStarred,toggle}=useWatchlist();
 const scenarios=useMemo(()=>data?buildTransferScenarios(data.mySquad,data.playerPool,data.bank,data.freeTransfers):[],[data]);
 if(isLoading)return <LoadingShell label="Calculating transfer scenarios…"/>; if(isError||!data)return <ErrorBlock message={String((error as Error)?.message??"Transfer data unavailable")} onRetry={()=>refetch()}/>;
 const recIndex=Math.max(0,scenarios.findIndex(s=>s.meetsDghThreshold&&s.netGain>0)); const selected=scenarios[active]??scenarios[0]; const impacts=selected?buildRivalImpacts((data.myRow?.dghTotalPoints??data.myRow?.total??0)+selected.projectedGwPointsGain,data.myRow?.dghTotalPoints??data.myRow?.total??0,data.myRow?.dghRank??data.myRow?.rank??999,data.rivals):[];
 const fixtureRunByTeam=buildFixtureRunLookup(data.fixtureRuns);
 const newsByPlayerId=new Map(data.spy.newsAlerts.filter(a=>a.isMine).map(a=>[a.playerId,a]));
 const riserIds=new Set(data.spy.priceRisers.map(p=>p.playerId)); const fallerIds=new Set(data.spy.priceFallers.map(p=>p.playerId));
 const watchedPlayers=watchlistIds.map(id=>data.playerIndex.get(id)).filter((p):p is NonNullable<typeof p>=>!!p);
 return <Page refreshing={refreshing} onRefresh={()=>void doRefresh()}><Header eyebrow={`GW${data.planningGameweek} · STRATEGY`} title="Transfers" subtitle={`£${data.bank.toFixed(1)}m bank · ${data.freeTransfers} free transfer${data.freeTransfers===1?"":"s"}`}/><FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt}/>
 <Hero variant="navy"><Pill label={recIndex===active?"RECOMMENDED":"COMPARE OPTIONS"} tone="onHero"/><Text style={{color:"#FFFFFF",fontSize:22,fontWeight:"900",marginTop:9}}>{selected?.moves.length?selected.moves.map(m=>`${m.out.webName} → ${m.in.webName}`).join(" · "):"Roll transfer"}</Text><View style={{flexDirection:"row",gap:14,marginTop:15}}><Metric label="Net gain" value={`${selected?.netGain>=0?"+":""}${selected?.netGain.toFixed(1)}`} onHero/><Metric label="Hit" value={selected?.hitCost?`-${selected.hitCost}`:"FREE"} onHero/><Metric label="Bank after" value={`£${selected?.bankAfter.toFixed(1)}m`} onHero/><Metric label="MDI Δ" value={`${selected?.dghMdiGain>=0?"+":""}${selected?.dghMdiGain.toFixed(2)}`} onHero/></View></Hero>
 <Section title="★ Your watchlist"/>
 <Surface>
   {watchedPlayers.length?watchedPlayers.map(p=>(
     <View key={p.id} style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:7,borderBottomWidth:1,borderBottomColor:theme.border}}>
       <Pressable style={{flex:1}} onPress={()=>router.push(`/player/${p.id}`)}>
         <Text style={{color:theme.foreground,fontWeight:"800",fontSize:12}}>{p.webName} <Text style={{color:theme.muted,fontWeight:"400"}}>· {p.teamShort} · £{p.price}m</Text></Text>
         <Text style={{color:theme.muted,fontSize:10,marginTop:2}}>
           Next GW proj {projectNextGw(p).toFixed(1)} pts
           {riserIds.has(p.id)?" · ▲ likely riser":""}
           {fallerIds.has(p.id)?" · ▼ likely faller":""}
           {newsByPlayerId.has(p.id)?` · ⚠ ${newsByPlayerId.get(p.id)!.text}`:""}
         </Text>
       </Pressable>
       <WatchlistStar starred={isStarred(p.id)} onPress={()=>toggle(p.id)} size={16}/>
     </View>
   )):<Text style={{color:theme.muted,fontSize:11}}>Star players from Spy, Transfers or a player page to track them here and on Forecast.</Text>}
 </Surface>
 <View style={{flexDirection:"row",gap:8,marginBottom:2}}>
   <Pressable onPress={()=>router.push("/(tabs)/whatif")} style={{flex:1,minHeight:44,borderRadius:12,borderWidth:1,borderColor:theme.border,backgroundColor:theme.surface,alignItems:"center",justifyContent:"center"}}><Text style={{color:theme.foreground,fontWeight:"800",fontSize:12}}>🧪 TRY YOUR OWN MOVE</Text></Pressable>
   <Pressable onPress={()=>router.push("/(tabs)/forecast")} style={{flex:1,minHeight:44,borderRadius:12,borderWidth:1,borderColor:theme.border,backgroundColor:theme.surface,alignItems:"center",justifyContent:"center"}}><Text style={{color:theme.foreground,fontWeight:"800",fontSize:12}}>📈 GW FORECAST</Text></Pressable>
 </View>
 {selected?.moves.length?<Pressable onPress={()=>router.push(`/compare?a=${selected.moves[0].out.id}&b=${selected.moves[0].in.id}` as any)} style={{minHeight:40,borderRadius:12,borderWidth:1,borderColor:theme.border,backgroundColor:theme.surfaceAlt,alignItems:"center",justifyContent:"center",marginBottom:2}}><Text style={{color:theme.foreground,fontWeight:"800",fontSize:11}}>⚖ COMPARE {selected.moves[0].out.webName.toUpperCase()} VS {selected.moves[0].in.webName.toUpperCase()}</Text></Pressable>:null}
 <Section title="Compare hit levels"/><View style={{flexDirection:"row",gap:8,marginBottom:8}}>{scenarios.map((s,i)=><Pressable key={s.id} onPress={()=>setActive(i)} style={{flex:1,minHeight:42,borderRadius:12,backgroundColor:i===active?theme.primary:theme.surface,borderWidth:1,borderColor:i===active?theme.primary:theme.border,alignItems:"center",justifyContent:"center"}}><Text style={{color:i===active?theme.background:theme.foreground,fontWeight:"900",fontSize:11}}>{s.hits===0?"ROLL":`${s.hits} HIT`}</Text></Pressable>)}</View>
 {selected?<Surface><View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}><Text style={{color:theme.foreground,fontWeight:"900"}}>{selected.label}</Text><Pill label={selected.riskLevel} tone={selected.riskLevel==="LOW"?"success":selected.riskLevel==="MEDIUM"?"warning":"danger"}/></View>{selected.moves.map((m,i)=><View key={i} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:theme.border}}><Text style={{color:theme.foreground,fontSize:14,fontWeight:"800"}}>{m.out.webName} <Text style={{color:theme.muted}}>→</Text> {m.in.webName}</Text><Text style={{color:theme.muted,fontSize:11,marginTop:2}}>{m.out.teamShort} → {m.in.teamShort}</Text></View>)}<Row label="Projected GW uplift" value={`+${selected.projectedGwPointsGain.toFixed(1)} pts`} emphasis/><Row label="Net after hit" value={`${selected.netGain>=0?"+":""}${selected.netGain.toFixed(1)} pts`} emphasis/><Row label="DGH threshold" value={selected.meetsDghThreshold?"Worth considering":"Not worth the hit"}/><Row label="Incoming WCS / DTQ" value={`${selected.dghIncomingWcs.toFixed(1)} / ${selected.dghIncomingDtq.toFixed(1)}`}/><Row label="Incoming MDI" value={selected.dghIncomingMdi.toFixed(2)}/>{selected.rationale.slice(0,3).map((r,i)=><Text key={i} style={{color:theme.muted,fontSize:11,lineHeight:17,marginTop:5}}>• {r}</Text>)}</Surface>:null}
 {selected?.moves.length?<><Section title="DGH Spy on this move"/><Surface>{selected.moves.map((m,i)=>{const outNews=newsByPlayerId.get(m.out.id);const outHorizon=multiGwValueScore(m.out,fixtureRunByTeam.get(m.out.teamId));const inHorizon=multiGwValueScore(m.in,fixtureRunByTeam.get(m.in.teamId));return <View key={i} style={{paddingVertical:8,borderBottomWidth:1,borderBottomColor:theme.border}}>
   <Text style={{color:theme.foreground,fontSize:12,fontWeight:"800"}}>{m.out.webName} → {m.in.webName}</Text>
   <Text style={{color:theme.muted,fontSize:10,marginTop:2}}>3-GW outlook: {outHorizon.score.toFixed(1)} → {inHorizon.score.toFixed(1)} ({inHorizon.score>=outHorizon.score?"+":""}{(inHorizon.score-outHorizon.score).toFixed(1)})</Text>
   {fallerIds.has(m.out.id)?<Text style={{color:theme.success,fontSize:10,marginTop:2}}>✓ {m.out.webName} is a likely price faller — selling before the drop</Text>:null}
   {riserIds.has(m.in.id)?<Text style={{color:theme.warning,fontSize:10,marginTop:2}}>⚠ {m.in.webName} is a likely price riser — buy before it goes up</Text>:null}
   {outNews?<Text style={{color:theme.error,fontSize:10,marginTop:2}}>⚠ {outNews.text}{outNews.ageLabel?` (${outNews.ageLabel})`:""}</Text>:null}
 </View>})}<Text style={{color:theme.muted,fontSize:9,marginTop:6}}>3-GW outlook weights this GW/GW+1/GW+2 fixtures — a separate signal from the main next-GW optimizer above, useful for medium-term transfer timing.</Text></Surface></>:null}
 <Section title="Rival impact"/><Surface>{impacts.slice(0,6).map(r=><View key={r.entryId} style={{flexDirection:"row",alignItems:"center",paddingVertical:8,borderBottomWidth:1,borderBottomColor:theme.border}}><View style={{flex:1}}><Text style={{color:theme.foreground,fontWeight:"700",fontSize:12}}>{r.managerName}</Text><Text style={{color:theme.muted,fontSize:10}}>beat probability</Text></View><Text style={{color:r.winProbabilityThisGw>=.5?theme.success:theme.error,fontSize:15,fontWeight:"900"}}>{Math.round(r.winProbabilityThisGw*100)}%</Text></View>)}<Text style={{color:theme.muted,fontSize:10,marginTop:8}}>Probability is a modelled estimate from projected score gaps, not a guarantee.</Text></Surface>
 </Page>;
}
