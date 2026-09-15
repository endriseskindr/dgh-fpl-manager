import { Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { Surface, Pill } from "./Premium";
import type { EnrichedPlayer } from "../lib/types";

export type DefConRow = { player: EnrichedPlayer; value: number | null; homeAway: "HOME" | "AWAY" | "—"; source: "OFFICIAL" | "UNAVAILABLE" };

export function DefConTracker({ rows }: { rows: DefConRow[] }) {
  const { theme } = useTheme();
  return <Surface>
    <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}>
      <Text style={{color:theme.foreground,fontWeight:"900",fontSize:14}}>Live DefCon</Text>
      <Pill label={rows.some(r=>r.value!=null)?"LIVE DATA":"DATA UNAVAILABLE"} tone={rows.some(r=>r.value!=null)?"success":"warning"}/>
    </View>
    <Text style={{color:theme.muted,fontSize:10,lineHeight:15,marginTop:4}}>Defensive contribution per player, with home/away context. No proxy is substituted when the official feed does not expose the metric.</Text>
    {rows.slice(0,15).map(r=><View key={r.player.id} style={{flexDirection:"row",alignItems:"center",paddingVertical:7,borderTopWidth:1,borderTopColor:theme.border}}>
      <Text style={{flex:1,color:theme.foreground,fontWeight:"700",fontSize:11}}>{r.player.webName}</Text>
      <Text style={{color:theme.muted,fontSize:9,width:45,textAlign:"center"}}>{r.homeAway}</Text>
      <Text style={{color:r.value==null?theme.muted:theme.primary,fontWeight:"900",fontSize:12,width:45,textAlign:"right"}}>{r.value==null?"—":r.value}</Text>
    </View>)}
  </Surface>;
}
