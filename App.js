import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, spacing, radius } from "./src/theme";

const codes = {
  0: ["Clear sky", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Fog", "🌫️"], 51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"], 71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"],
  80: ["Rain showers", "🌦️"], 81: ["Rain showers", "🌧️"], 82: ["Heavy showers", "⛈️"], 95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm", "⛈️"], 99: ["Thunderstorm", "⛈️"]
};
const info = (code) => codes[code] || ["Weather conditions", "🌡️"];
const dayName = (date, i) => i === 0 ? "Today" : new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });

export default function App() {
  const [city, setCity] = useState("Chattogram");
  const [place, setPlace] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const search = useCallback(async (name) => {
    const q = name.trim();
    if (!q) { setError("Enter a city name."); return; }
    setLoading(true); setError("");
    try {
      const g = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(q) + "&count=1&language=en&format=json");
      if (!g.ok) throw new Error("City search is temporarily unavailable.");
      const result = (await g.json()).results?.[0];
      if (!result) throw new Error("City not found. Check the spelling and try again.");
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + result.latitude + "&longitude=" + result.longitude +
        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5";
      const f = await fetch(url);
      if (!f.ok) throw new Error("Weather service is temporarily unavailable.");
      setData(await f.json()); setPlace(result); setCity(result.name);
    } catch (e) { setError(e.message || "Could not load weather."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { search("Chattogram"); }, [search]);

  const current = data?.current;
  const today = current ? info(current.weather_code) : null;
  const daily = data?.daily;

  return <View style={styles.screen}>
    <StatusBar barStyle="light-content" backgroundColor={colors.background} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <View><Text style={styles.brand}>SKYCAST</Text><Text style={styles.eyebrow}>WEATHER, WITH A VOICE</Text></View>
        <Text style={styles.live}>● LIVE WEATHER</Text>
      </View>
      <Text style={styles.heading}>Your sky, right now.</Text>
      <Text style={styles.subheading}>A clear look at the day ahead.</Text>
      <View style={styles.searchRow}>
        <TextInput accessibilityLabel="Search city" value={city} onChangeText={setCity} onSubmitEditing={() => search(city)} returnKeyType="search" placeholder="Search city" placeholderTextColor={colors.muted} style={styles.input} />
        <Pressable accessibilityRole="button" onPress={() => search(city)} style={({pressed}) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>Search</Text></Pressable>
      </View>
      {loading ? <View style={styles.state}><ActivityIndicator size="large" color={colors.accent}/><Text style={styles.muted}>Getting your forecast…</Text></View>
      : error ? <View style={styles.state}><Text style={styles.weatherIcon}>☁️</Text><Text style={styles.cardTitle}>Weather unavailable</Text><Text style={styles.muted}>{error}</Text><Pressable onPress={() => search(city)} style={styles.retry}><Text style={styles.buttonText}>Try again</Text></Pressable></View>
      : current && daily ? <>
        <View style={styles.hero}>
          <View style={styles.top}><View><Text style={styles.place}>{place?.name}{place?.admin1 ? ", " + place.admin1 : ""}</Text><Text style={styles.muted}>{place?.country}</Text></View><Text style={styles.heroIcon}>{today[1]}</Text></View>
          <Text style={styles.temperature}>{Math.round(current.temperature_2m)}°</Text>
          <Text style={styles.condition}>{today[0]}</Text>
          <Text style={styles.muted}>Feels like {Math.round(current.apparent_temperature)}°</Text>
          <View style={styles.metrics}>
            <Metric label="HUMIDITY" value={current.relative_humidity_2m + "%"}/>
            <Metric label="WIND" value={Math.round(current.wind_speed_10m) + " km/h"}/>
            <Metric label="RAIN" value={current.precipitation + " mm"}/>
          </View>
          <Text style={styles.timestamp}>Local time · {current.time?.replace("T", " ")}</Text>
        </View>
        <View style={styles.sectionTop}><Text style={styles.sectionTitle}>5-day forecast</Text><Text style={styles.eyebrow}>UP NEXT</Text></View>
        <View style={styles.forecast}>
          {daily.time.map((date, i) => { const w = info(daily.weather_code[i]); return <View key={date} style={styles.forecastRow}>
            <Text style={styles.day}>{dayName(date, i)}</Text><Text style={styles.forecastIcon}>{w[1]}</Text><Text style={styles.forecastCondition}>{w[0]}</Text>
            <Text style={styles.high}>{Math.round(daily.temperature_2m_max[i])}°</Text><Text style={styles.low}>{Math.round(daily.temperature_2m_min[i])}°</Text>
          </View>; })}
        </View>
        <Text style={styles.timestamp}>Weather data provided by Open-Meteo.</Text>
      </> : null}
      <Pressable onPress={() => search(city)} style={styles.refresh}><Text style={styles.refreshText}>↻  Refresh forecast</Text></Pressable>
    </ScrollView>
  </View>;
}
function Metric({label, value}) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.background}, content:{padding:spacing.lg,paddingTop:spacing.xl,paddingBottom:44,gap:spacing.md},
  top:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}, brand:{color:colors.text,fontSize:22,fontWeight:"900",letterSpacing:4},
  eyebrow:{color:colors.muted,fontSize:9,letterSpacing:2,marginTop:4}, live:{color:colors.accent,fontSize:9,fontWeight:"800",letterSpacing:1},
  heading:{color:colors.text,fontSize:28,fontWeight:"800",marginTop:spacing.lg}, subheading:{color:colors.muted,fontSize:14,marginTop:-8},
  searchRow:{flexDirection:"row",gap:spacing.sm,marginTop:spacing.sm}, input:{flex:1,minHeight:48,borderRadius:radius.md,paddingHorizontal:spacing.md,color:colors.text,backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,fontSize:15},
  button:{backgroundColor:colors.accent,borderRadius:radius.md,justifyContent:"center",paddingHorizontal:spacing.lg}, buttonText:{color:colors.background,fontWeight:"800"},
  pressed:{opacity:.75}, state:{minHeight:230,backgroundColor:colors.panel,borderRadius:radius.lg,justifyContent:"center",alignItems:"center",padding:spacing.lg,gap:spacing.sm},
  muted:{color:colors.muted,textAlign:"center",fontSize:13,lineHeight:20}, weatherIcon:{fontSize:38}, cardTitle:{color:colors.text,fontSize:18,fontWeight:"800"},
  retry:{backgroundColor:colors.accent,borderRadius:radius.md,paddingHorizontal:spacing.lg,paddingVertical:spacing.sm,marginTop:spacing.sm},
  hero:{backgroundColor:colors.panel,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,padding:spacing.lg},
  place:{color:colors.text,fontSize:18,fontWeight:"800"}, heroIcon:{fontSize:48}, temperature:{color:colors.text,fontSize:76,fontWeight:"200",letterSpacing:-4,marginTop:12},
  condition:{color:colors.text,fontSize:17,fontWeight:"700",marginTop:-4}, metrics:{flexDirection:"row",borderTopWidth:1,borderTopColor:colors.border,marginTop:spacing.lg,paddingTop:spacing.md,justifyContent:"space-between"},
  metric:{gap:5}, metricLabel:{color:colors.muted,fontSize:9,letterSpacing:1,fontWeight:"800"}, metricValue:{color:colors.text,fontSize:15,fontWeight:"700"},
  timestamp:{color:colors.muted,fontSize:10,marginTop:spacing.md}, sectionTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:spacing.md},
  sectionTitle:{color:colors.text,fontSize:18,fontWeight:"800"}, forecast:{backgroundColor:colors.panel,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,paddingHorizontal:spacing.md},
  forecastRow:{minHeight:58,flexDirection:"row",alignItems:"center",gap:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.border},
  day:{width:46,color:colors.text,fontSize:13,fontWeight:"700"}, forecastIcon:{width:25,fontSize:18,textAlign:"center"},
  forecastCondition:{flex:1,color:colors.muted,fontSize:11}, high:{color:colors.text,fontSize:13,fontWeight:"700",width:27,textAlign:"right"},
  low:{color:colors.muted,fontSize:13,width:27,textAlign:"right"}, refresh:{alignSelf:"center",padding:spacing.sm}, refreshText:{color:colors.accent,fontWeight:"700"}
});
