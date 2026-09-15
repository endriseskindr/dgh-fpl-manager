import { Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
export function DghBadge({label,tone="primary"}:{label:string;tone?:"primary"|"success"|"warning"|"danger"}){const{theme}=useTheme();const c=tone==="success"?theme.success:tone==="warning"?theme.warning:tone==="danger"?theme.error:theme.primary;return <View style={{alignSelf:"flex-start",borderRadius:999,borderWidth:1,borderColor:c+"66",backgroundColor:c+"16",paddingHorizontal:8,paddingVertical:4}}><Text style={{color:c,fontSize:8,fontWeight:"900",letterSpacing:.5}}>{label}</Text></View>}
