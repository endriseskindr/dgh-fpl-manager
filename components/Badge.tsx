import { Text, View } from "react-native";
export function Badge({label,color}:{label:string;color:string}){return <View style={{alignSelf:"flex-start",borderRadius:999,paddingHorizontal:9,paddingVertical:5,backgroundColor:color+"20",borderWidth:1,borderColor:color+"55"}}><Text style={{color,fontSize:9,fontWeight:"900",letterSpacing:.6}}>{label}</Text></View>}
