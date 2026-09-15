import { Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import type { SquadPick } from "../lib/types";

export function SquadDnaPitch({ squad }: { squad: SquadPick[] }) {
 const {theme}=useTheme(); const xi=squad.filter(p=>p.isXI); const groups=["GKP","DEF","MID","FWD"]; return <View style={{borderRadius:20,borderWidth:1,borderColor:theme.border,backgroundColor:theme.surfaceAlt,padding:12,minHeight:330}}>
  <Text style={{color:theme.foreground,fontWeight:"900",fontSize:13,marginBottom:8}}>Squad-DNA pitch overlay</Text>
  {groups.map(pos=><View key={pos} style={{flex:1,flexDirection:"row",justifyContent:"space-around",alignItems:"center",paddingVertical:8}}>{xi.filter(p=>p.player.position===pos).map(p=><View key={p.playerId} style={{alignItems:"center",maxWidth:70}}><View style={{width:34,height:34,borderRadius:17,backgroundColor:theme.primary,alignItems:"center",justifyContent:"center"}}><Text style={{color:theme.background,fontWeight:"900",fontSize:9}}>{p.player.webName.slice(0,3).toUpperCase()}</Text></View><Text numberOfLines={1} style={{color:theme.foreground,fontSize:8,fontWeight:"800",marginTop:3}}>{p.player.webName}</Text><Text style={{color:theme.muted,fontSize:7}}>{p.livePoints} pts</Text></View>)}</View>)}
  <View style={{borderTopWidth:1,borderTopColor:theme.border,paddingTop:7,flexDirection:"row",justifyContent:"space-between"}}><Text style={{color:theme.muted,fontSize:8}}>BADGES: captain · differential · template</Text><Text style={{color:theme.primary,fontSize:8,fontWeight:"900"}}>DGH DNA</Text></View>
 </View>
}
