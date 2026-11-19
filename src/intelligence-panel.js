import React from "react";
import { Pressable, Text, View } from "react-native";
import { getActivityScores, getSafetyGuidance, getWeatherDecisions } from "./weather-intelligence";
import { colors, spacing } from "./theme";

const styles = {
  wrap: { gap: spacing.md },
  section: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: spacing.md, gap: 10 },
  title: { color: colors.navy, fontSize: 18, fontWeight: "800" },
  label: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  answer: { color: colors.text, fontSize: 19, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  score: { color: colors.accentDark, fontSize: 17, fontWeight: "800", width: 42, textAlign: "right" },
  track: { height: 7, flex: 1, backgroundColor: colors.panelAlt, overflow: "hidden", borderRadius: 4 },
  fill: { height: 7, backgroundColor: colors.accent, borderRadius: 4 },
  buttonRow: { flexDirection: "row", gap: 8 },
  button: { borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, flex: 1, alignItems: "center" },
  buttonText: { color: colors.accentDark, fontSize: 12, fontWeight: "800" },
  warning: { color: colors.warning, fontSize: 12, fontWeight: "700" }
};

export default function IntelligencePanel({ forecast, air, place, onAsk, onReport, reportStatus, reports = [] }) {
  const decisions = getWeatherDecisions(forecast);
  const scores = getActivityScores(forecast);
  const safety = getSafetyGuidance(forecast?.current?.weather_code ?? -1);
  const current = forecast?.current || {};
  const pollen = Object.entries(air?.pollen || {}).filter(([, value]) => Number.isFinite(value));
  const pressureValues = (forecast?.hourly?.pressure_msl || []).slice(0, 6).filter(Number.isFinite);
  const pressureChange = pressureValues.length > 1 ? Math.round(pressureValues[pressureValues.length - 1] - pressureValues[0]) : null;
  return <View style={styles.wrap}>
    <View style={styles.section}>
      <Text style={styles.label}>WEATHER DECISIONS · {place?.name || "YOUR LOCATION"}</Text>
      <Text style={styles.title}>What should I do today?</Text>
      <Text style={styles.body}>Recommendations are calculated from the available forecast, not guarantees.</Text>
      <View style={{gap:4}}>
        <Text style={styles.answer}>{decisions.umbrella.answer}</Text>
        <Text style={styles.body}>{decisions.umbrella.detail}</Text>
      </View>
      <View style={{height:1,backgroundColor:colors.border}}/>
      <View style={{gap:4}}>
        <Text style={styles.answer}>{decisions.laundry.answer}</Text>
        <Text style={styles.body}>{decisions.laundry.detail}</Text>
      </View>
      <View style={{height:1,backgroundColor:colors.border}}/>
      <Text style={styles.label}>RAIN TIMING</Text>
      <Text style={styles.body}>{decisions.rainTiming.detail}</Text>
      {!decisions.rainTiming.hasMinuteData ? <Text style={styles.warning}>No minute-level claim is made when this provider does not return 15-minute data.</Text> : null}
    </View>
    <View style={styles.section}>
      <Text style={styles.label}>OUTDOOR ACTIVITY PLANNER</Text>
      <Text style={styles.title}>Activity conditions</Text>
      {scores.map((item) => <View key={item.id} style={{gap:4}}>
        <View style={styles.row}><Text style={{color:colors.text,fontWeight:"700",fontSize:13}}>{item.label}</Text><Text style={styles.score}>{item.score}/100</Text></View>
        <View style={styles.track}><View style={[styles.fill,{width:item.score+"%"}]}/></View>
        <Text style={styles.body}>{item.reason}</Text>
      </View>)}
      <Text style={styles.body}>These are transparent planning estimates, not safety guarantees. Check local conditions before activities.</Text>
    </View>
    <View style={styles.section}>
      <Text style={styles.label}>HEALTH AND ENVIRONMENT</Text>
      <Text style={styles.title}>Outdoor exposure snapshot</Text>
      <Text style={styles.body}>UV index today: {Number.isFinite(forecast?.daily?.uv_index_max?.[0]) ? Math.round(forecast.daily.uv_index_max[0]) : "Unavailable"} · US AQI: {Number.isFinite(air?.aqi) ? Math.round(air.aqi) : "Unavailable"}</Text>
      <Text style={styles.body}>Atmospheric pressure: {Number.isFinite(current.pressure_msl) ? Math.round(current.pressure_msl) + " hPa" : "Unavailable"}{pressureChange !== null ? " · 6-hour change " + (pressureChange > 0 ? "+" : "") + pressureChange + " hPa" : ""}</Text>
      {pollen.length ? pollen.map(([name,value]) => <Text key={name} style={styles.body}>{name.replace("_"," ")} pollen: {Math.round(value)}</Text>) : <Text style={styles.body}>Pollen readings are unavailable for this location or time.</Text>}
      <Text style={styles.warning}>This is environmental information, not medical advice. SkyCast does not predict migraines, joint pain or individual symptoms.</Text>
    </View>
    <View style={styles.section}>
      <Text style={styles.label}>COMMUNITY WEATHER REPORTS</Text>
      <Text style={styles.title}>What is happening near you?</Text>
      <Text style={styles.body}>Share a local observation for {place?.name || "this location"}. Reports are observations, not verified official measurements.</Text>
      <View style={styles.buttonRow}>
        <Pressable accessibilityRole="button" onPress={() => onReport?.("raining")} style={styles.button}><Text style={styles.buttonText}>It's raining</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => onReport?.("not_raining")} style={styles.button}><Text style={styles.buttonText}>Not raining</Text></Pressable>
      </View>
      {reportStatus ? <Text style={styles.body}>{reportStatus}</Text> : null}
      <View style={{height:1,backgroundColor:colors.border}}/>
      <Text style={styles.label}>RECENT CITY REPORTS</Text>
      {reports.length ? reports.slice(0,5).map((report) => <View key={report.id} style={{gap:2}}>
        <Text style={{color:colors.text,fontSize:12,fontWeight:"700"}}>{report.observation === "raining" ? "Rain reported" : "No rain reported"}</Text>
        <Text style={styles.body}>{report.createdAt?.toDate ? report.createdAt.toDate().toLocaleString() : "Recently submitted"} · Community observation, not an official measurement.</Text>
      </View>) : <Text style={styles.body}>No recent community observations for this city yet.</Text>}
    </View>
    <View style={styles.section}>
      <Text style={styles.label}>SEVERE WEATHER SAFETY</Text>
      <Text style={styles.title}>Simple steps to stay safer</Text>
      {safety.map((line, index) => <Text key={index} style={styles.body}>{index + 1}. {line}</Text>)}
      <Text style={styles.warning}>This guidance is available in-app. Always follow official alerts and emergency services for your area.</Text>
    </View>
    <View style={styles.section}>
      <Text style={styles.label}>MORE WEATHER INTELLIGENCE</Text>
      <Text style={styles.title}>Ask a weather question</Text>
      <Text style={styles.body}>Ask the Forecast already supports weather questions and uses the latest loaded forecast snapshot.</Text>
      <Pressable accessibilityRole="button" onPress={onAsk} style={[styles.button,{flex:0}]}><Text style={styles.buttonText}>Open Ask the Forecast</Text></Pressable>
      <Text style={styles.body}>Calendar-aware event alerts, live route-risk feeds, pollen-specific forecasts, long-term climate comparisons and camera-based AR are next integrations. They will only be shown as active when their data providers, permissions and device capabilities are connected.</Text>
    </View>
  </View>;
}
