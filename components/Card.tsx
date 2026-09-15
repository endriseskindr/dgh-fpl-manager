import { View, type ViewProps } from "react-native";
import { useTheme } from "../hooks/useTheme";
export function Card({ style, children, ...rest }: ViewProps) { const {theme}=useTheme(); return <View style={[{backgroundColor:theme.surface,borderRadius:18,borderWidth:1,borderColor:theme.border,padding:15,marginBottom:12},style]} {...rest}>{children}</View>; }
