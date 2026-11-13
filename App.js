import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "./src/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { colors, spacing, radius } from "./src/theme";

const FAVORITES_KEY = "skycast.favoriteCities.v1";
const weatherCodes = {
  0:["Clear sky","☀️"],1:["Mainly clear","🌤️"],2:["Partly cloudy","⛅"],3:["Overcast","☁️"],
  45:["Fog","🌫️"],48:["Rime fog","🌫️"],51:["Light drizzle","🌦️"],53:["Drizzle","🌦️"],55:["Heavy drizzle","🌧️"],
  56:["Freezing drizzle","🌧️"],57:["Freezing drizzle","🌧️"],61:["Light rain","🌦️"],63:["Rain","🌧️"],65:["Heavy rain","🌧️"],
  66:["Freezing rain","🌧️"],67:["Heavy freezing rain","🌧️"],71:["Light snow","🌨️"],73:["Snow","🌨️"],75:["Heavy snow","❄️"],
  77:["Snow grains","🌨️"],80:["Rain showers","🌦️"],81:["Rain showers","🌧️"],82:["Heavy showers","⛈️"],
  85:["Snow showers","🌨️"],86:["Heavy snow showers","❄️"],95:["Thunderstorm","⛈️"],96:["Thunderstorm with hail","⛈️"],99:["Severe thunderstorm","⛈️"]
};
const describe = (code) => weatherCodes[code] || ["Changing conditions","🌡️"];
const dayLabel = (date, index) => index === 0 ? "Today" : new Date(date + "T12:00:00").toLocaleDateString(undefined,{weekday:"short"});
const number = (value, suffix="") => Number.isFinite(value) ? Math.round(value) + suffix : "—";
const clockLabel = (value) => value?.split("T")?.[1]?.slice(0,5) || "—";

async function getCity(name) {
  const response = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(name) + "&count=1&language=en&format=json");
  if (!response.ok) throw new Error("City search is temporarily unavailable.");
  const city = (await response.json()).results?.[0];
  if (!city) throw new Error("City not found. Check the spelling and try again.");
  return city;
}
async function getWeather(city) {
  const base = "https://api.open-meteo.com/v1/forecast?latitude=" + city.latitude + "&longitude=" + city.longitude;
  const forecastUrl = base + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,uv_index,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset&timezone=auto&forecast_days=7";
  const [forecastResponse, airResponse] = await Promise.all([
    fetch(forecastUrl),
    fetch("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + city.latitude + "&longitude=" + city.longitude + "&hourly=us_aqi,pm2_5,pm10&timezone=auto&forecast_days=1").catch(() => null)
  ]);
  if (!forecastResponse.ok) throw new Error("Weather service is temporarily unavailable.");
  const forecast = await forecastResponse.json();
  let air = null;
  if (airResponse?.ok) {
    const result = await airResponse.json();
    const times = result.hourly?.time || [];
    const matchingIndex = times.findIndex((time) => time >= forecast.current.time);
    const index = matchingIndex < 0 ? Math.max(0, times.length - 1) : matchingIndex;
    air = { aqi: result.hourly?.us_aqi?.[index], pm25: result.hourly?.pm2_5?.[index], pm10: result.hourly?.pm10?.[index] };
  }
  return { forecast, air };
}

export default function App() {
  const [query, setQuery] = useState("Chattogram");
  const [place, setPlace] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState([]);
  const [firebaseUserId, setFirebaseUserId] = useState(null);
  const [compare, setCompare] = useState([]);
  const [comparing, setComparing] = useState(false);
  const latestWeatherRequest = useRef(0);

  const loadCity = useCallback(async (name) => {
    const value = name.trim();
    if (!value) { setError("Enter a city name."); return; }
    const requestId = ++latestWeatherRequest.current;
    setLoading(true); setError("");
    try {
      const city = await getCity(value);
      const result = await getWeather(city);
      if (requestId !== latestWeatherRequest.current) return;
      setPlace(city); setData(result); setQuery(city.name); setCompare([]);
    } catch (err) {
      if (requestId === latestWeatherRequest.current) setError(err.message || "Could not load weather.");
    } finally {
      if (requestId === latestWeatherRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const cleanCities = (value) => Array.isArray(value)
      ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))].slice(-6)
      : [];
    const initializeAccount = async () => {
      let localCities = [];
      try {
        const raw = await AsyncStorage.getItem(FAVORITES_KEY);
        localCities = cleanCities(raw ? JSON.parse(raw) : []);
        if (active) setFavorites(localCities);
      } catch {}
      try {
        const credential = await signInAnonymously(auth);
        const userId = credential.user.uid;
        const userRef = doc(db, "users", userId);
        const snapshot = await getDoc(userRef);
        const remoteCities = snapshot.exists() ? cleanCities(snapshot.data().favoriteCities) : [];
        const mergedCities = cleanCities([...remoteCities, ...localCities]);
        await setDoc(userRef, { favoriteCities: mergedCities, updatedAt: serverTimestamp() }, { merge: true });
        if (active) {
          setFirebaseUserId(userId);
          setFavorites(mergedCities);
          await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(mergedCities));
        }
      } catch {
        // Weather and locally saved cities continue to work if Firebase is temporarily unavailable.
      }
    };
    void initializeAccount();
    loadCity("Chattogram");
    return () => {
      active = false;
      latestWeatherRequest.current += 1;
    };
  }, [loadCity]);

  const saveFavorites = async (next) => {
    setFavorites(next);
    try { await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
    if (firebaseUserId) {
      try {
        await setDoc(doc(db, "users", firebaseUserId), {
          favoriteCities: next,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch {
        // Keep the local copy; it will be merged with Firestore on the next successful sign-in.
      }
    }
  };
  const isFavorite = !!place && favorites.some((item) => item.toLowerCase() === place.name.toLowerCase());
  const toggleFavorite = () => {
    if (!place) return;
    const next = isFavorite ? favorites.filter((item) => item.toLowerCase() !== place.name.toLowerCase()) : [...favorites, place.name].slice(-6);
    void saveFavorites(next);
  };

  const runComparison = async () => {
    if (favorites.length < 2) return;
    setComparing(true); setError("");
    try {
      const results = await Promise.all(favorites.slice(0,6).map(async (name) => {
        const city = await getCity(name);
        const response = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + city.latitude + "&longitude=" + city.longitude + "&current=temperature_2m,weather_code&timezone=auto");
        if (!response.ok) throw new Error("Could not compare saved cities.");
        const weather = await response.json();
        return { name: city.name, temperature: weather.current.temperature_2m, code: weather.current.weather_code };
      }));
      setCompare(results);
    } catch (err) { setError(err.message || "Could not compare saved cities."); }
    finally { setComparing(false); }
  };

  const current = data?.forecast?.current;
  const daily = data?.forecast?.daily;
  const hourly = data?.forecast?.hourly;
  const foundHourIndex = hourly?.time?.findIndex((time) => time >= current?.time) ?? 0;
  const hourlyStart = Math.max(0, foundHourIndex);
  const condition = current ? describe(current.weather_code) : null;
  const briefing = useMemo(() => {
    if (!current || !daily || !place) return "";
    const rain = daily.precipitation_probability_max?.[0] ?? 0;
    const uv = daily.uv_index_max?.[0];
    const advice = rain >= 60 ? "Rain is likely, so consider carrying an umbrella." : rain >= 30 ? "There is some chance of rain; check again before heading out." : "Rain chances look relatively low.";
    const uvAdvice = uv >= 8 ? "UV levels may be very high, so plan shade and sun protection." : uv >= 6 ? "UV levels may be high around midday." : "UV levels look moderate or low.";
    return "Today in " + place.name + ", expect " + describe(current.weather_code)[0].toLowerCase() + " with a temperature of " + Math.round(current.temperature_2m) + "°C, feeling like " + Math.round(current.apparent_temperature) + "°C. Today's high is " + Math.round(daily.temperature_2m_max[0]) + "°C and the low is " + Math.round(daily.temperature_2m_min[0]) + "°C. " + advice + " " + uvAdvice;
  }, [current, daily, place]);

  const aqi = data?.air?.aqi;
  const aqiLabel = !Number.isFinite(aqi) ? "Unavailable" : aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Sensitive groups" : aqi <= 200 ? "Unhealthy" : aqi <= 300 ? "Very unhealthy" : "Hazardous";

  return <View style={styles.screen}>
    <StatusBar barStyle="light-content" backgroundColor={colors.background}/>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <View><Text style={styles.brand}>SKYCAST</Text><Text style={styles.eyebrow}>YOUR WEATHER COMPANION</Text></View>
        <Text style={styles.live}>● LIVE DATA</Text>
      </View>
      <Text style={styles.heading}>Your sky, right now.</Text>
      <Text style={styles.subheading}>Clear forecasts. Better plans.</Text>
      <View style={styles.searchRow}>
        <TextInput accessibilityLabel="Search city" value={query} onChangeText={setQuery} onSubmitEditing={() => loadCity(query)} returnKeyType="search" placeholder="Search any city" placeholderTextColor={colors.muted} style={styles.input}/>
        <Pressable accessibilityRole="button" onPress={() => loadCity(query)} style={styles.button}><Text style={styles.buttonText}>Search</Text></Pressable>
      </View>
      {favorites.length > 0 ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved cities</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {favorites.map((name) => <Pressable key={name} onPress={() => loadCity(name)} style={styles.chip}><Text style={styles.chipText}>{name}</Text></Pressable>)}
        </ScrollView>
      </View> : null}
      {loading ? <View style={styles.state}><ActivityIndicator size="large" color={colors.accent}/><Text style={styles.muted}>Getting your forecast…</Text></View>
      : error && !current ? <View style={styles.state}><Text style={styles.weatherIcon}>☁️</Text><Text style={styles.cardTitle}>Weather unavailable</Text><Text style={styles.muted}>{error}</Text><Pressable onPress={() => loadCity(query)} style={styles.retry}><Text style={styles.buttonText}>Try again</Text></Pressable></View>
      : current && daily ? <>
        {error ? <Text style={styles.inlineError}>{error}</Text> : null}
        <View style={styles.hero}>
          <View style={styles.top}>
            <View style={{flex:1}}><Text style={styles.place}>{place?.name}{place?.admin1 ? ", " + place.admin1 : ""}</Text><Text style={styles.muted}>{place?.country}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={isFavorite ? "Remove saved city" : "Save city"} onPress={toggleFavorite} style={styles.favorite}><Text style={styles.favoriteText}>{isFavorite ? "★ Saved" : "☆ Save city"}</Text></Pressable>
            <Text style={styles.heroIcon}>{condition[1]}</Text>
          </View>
          <Text style={styles.temperature}>{number(current.temperature_2m,"°")}</Text>
          <Text style={styles.condition}>{condition[0]}</Text>
          <Text style={styles.muted}>Feels like {number(current.apparent_temperature,"°C")}</Text>
          <View style={styles.metrics}>
            <Metric label="HUMIDITY" value={number(current.relative_humidity_2m,"%")}/>
            <Metric label="WIND" value={number(current.wind_speed_10m," km/h")}/>
            <Metric label="RAIN NOW" value={number(current.precipitation," mm")}/>
          </View>
          <Text style={styles.timestamp}>Local time · {current.time?.replace("T"," ")}</Text>
          <Pressable onPress={() => Linking.openURL("https://www.openstreetmap.org/?mlat=" + place.latitude + "&mlon=" + place.longitude + "#map=10/" + place.latitude + "/" + place.longitude)} style={styles.mapLink}><Text style={styles.mapLinkText}>⌖  View this city on map</Text></Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your written weather briefing</Text>
          <View style={styles.briefing}><Text style={styles.briefingKicker}>THE DAILY OUTLOOK</Text><Text style={styles.briefingText}>{briefing}</Text><Text style={styles.briefingFooter}>Updated with the latest available forecast · No audio or speech</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Environment snapshot</Text>
          <View style={styles.environment}>
            <Metric label="US AIR QUALITY" value={Number.isFinite(aqi) ? Math.round(aqi) + " · " + aqiLabel : "Unavailable"}/>
            <Metric label="PM2.5" value={number(data?.air?.pm25," µg/m³")}/>
            <Metric label="PM10" value={number(data?.air?.pm10," µg/m³")}/>
            <Metric label="UV MAX" value={number(daily.uv_index_max?.[0])}/>
          </View>
          <Text style={styles.timestamp}>Air-quality readings are estimates and may be unavailable for some locations.</Text>
        </View>

        {daily.precipitation_probability_max?.[0] >= 60 ? <View style={styles.alert}><Text style={styles.alertTitle}>☂ Rain heads-up</Text><Text style={styles.alertText}>There is a {Math.round(daily.precipitation_probability_max[0])}% chance of precipitation today. Consider carrying an umbrella.</Text></View> : null}

        <View style={styles.section}>
          <View style={styles.sectionTop}><Text style={styles.sectionTitle}>Next 12 hours</Text><Text style={styles.eyebrow}>HOURLY</Text></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourly}>
            {hourly?.time?.slice(hourlyStart,hourlyStart+12).map((time,i) => <View key={time} style={styles.hourCard}>
              <Text style={styles.hourTime}>{clockLabel(time)}</Text>
              <Text style={styles.hourIcon}>{describe(hourly.weather_code?.[i+hourlyStart] ?? daily.weather_code[0])[1]}</Text>
              <Text style={styles.hourTemp}>{number(hourly.temperature_2m[i+hourlyStart],"°")}</Text>
              <Text style={styles.hourRain}>☂ {number(hourly.precipitation_probability[i+hourlyStart],"%")}</Text>
            </View>)}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTop}><Text style={styles.sectionTitle}>7-day forecast</Text><Text style={styles.eyebrow}>THE WEEK AHEAD</Text></View>
          <View style={styles.forecast}>
            {daily.time.map((date,i) => { const w=describe(daily.weather_code[i]); return <View key={date} style={styles.forecastRow}>
              <Text style={styles.day}>{dayLabel(date,i)}</Text><Text style={styles.forecastIcon}>{w[1]}</Text><Text style={styles.forecastCondition}>{w[0]}</Text>
              <Text style={styles.high}>{number(daily.temperature_2m_max[i],"°")}</Text><Text style={styles.low}>{number(daily.temperature_2m_min[i],"°")}</Text>
              <Text style={styles.rainChance}>☂ {number(daily.precipitation_probability_max[i],"%")}</Text>
            </View>; })}
          </View>
          <Text style={styles.timestamp}>Sunrise {daily.sunrise?.[0] ? clockLabel(daily.sunrise[0]) : "—"} · Sunset {daily.sunset?.[0] ? clockLabel(daily.sunset[0]) : "—"}</Text>
        </View>
      </> : null}

      <View style={styles.section}>
        <View style={styles.sectionTop}><Text style={styles.sectionTitle}>City comparison</Text><Text style={styles.eyebrow}>YOUR SAVED PLACES</Text></View>
        <Text style={styles.muted}>Save at least two cities to compare their current temperatures.</Text>
        <Pressable accessibilityRole="button" disabled={favorites.length < 2 || comparing} onPress={runComparison} style={[styles.compareButton,(favorites.length<2||comparing)&&styles.disabled]}>
          {comparing ? <ActivityIndicator color={colors.background}/> : <Text style={styles.buttonText}>Compare saved cities ({favorites.length})</Text>}
        </Pressable>
        {compare.map((item) => <View key={item.name} style={styles.compareRow}><Text style={styles.place}>{item.name}</Text><Text style={styles.compareCondition}>{describe(item.code)[1]} {describe(item.code)[0]}</Text><Text style={styles.compareTemp}>{number(item.temperature,"°C")}</Text></View>)}
      </View>
      <Text style={styles.footer}>Weather and air-quality data by Open-Meteo. Forecasts are estimates and can change.</Text>
      <Pressable onPress={() => loadCity(place?.name || query)} style={styles.refresh}><Text style={styles.refreshText}>↻  Refresh forecast</Text></Pressable>
    </ScrollView>
  </View>;
}

function Metric({label,value}) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.background},content:{padding:spacing.lg,paddingTop:spacing.xl,paddingBottom:44,gap:spacing.md},
  top:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},brand:{color:colors.text,fontSize:22,fontWeight:"900",letterSpacing:4},
  eyebrow:{color:colors.muted,fontSize:9,letterSpacing:1.5,marginTop:4},live:{color:colors.accent,fontSize:9,fontWeight:"800",letterSpacing:1},
  heading:{color:colors.text,fontSize:28,fontWeight:"800",marginTop:spacing.lg},subheading:{color:colors.muted,fontSize:14,marginTop:-8},
  searchRow:{flexDirection:"row",gap:spacing.sm,marginTop:spacing.sm},input:{flex:1,minHeight:48,borderRadius:radius.md,paddingHorizontal:spacing.md,color:colors.text,backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,fontSize:15},
  button:{backgroundColor:colors.accent,borderRadius:radius.md,justifyContent:"center",paddingHorizontal:spacing.lg},buttonText:{color:colors.background,fontWeight:"800"},
  state:{minHeight:180,backgroundColor:colors.panel,borderRadius:radius.lg,justifyContent:"center",alignItems:"center",padding:spacing.lg,gap:spacing.sm},
  muted:{color:colors.muted,fontSize:12,lineHeight:19},weatherIcon:{fontSize:38},cardTitle:{color:colors.text,fontSize:18,fontWeight:"800"},
  retry:{backgroundColor:colors.accent,borderRadius:radius.md,paddingHorizontal:spacing.lg,paddingVertical:spacing.sm,marginTop:spacing.sm},
  hero:{backgroundColor:colors.panel,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,padding:spacing.lg},
  place:{color:colors.text,fontSize:16,fontWeight:"800"},favorite:{borderWidth:1,borderColor:colors.border,borderRadius:radius.full,paddingHorizontal:10,paddingVertical:7},favoriteText:{color:colors.accent,fontSize:11,fontWeight:"800"},
  heroIcon:{fontSize:42},temperature:{color:colors.text,fontSize:76,fontWeight:"200",letterSpacing:-4,marginTop:12},
  condition:{color:colors.text,fontSize:17,fontWeight:"700",marginTop:-4},metrics:{flexDirection:"row",borderTopWidth:1,borderTopColor:colors.border,marginTop:spacing.lg,paddingTop:spacing.md,justifyContent:"space-between",gap:8},
  metric:{gap:5,flex:1},metricLabel:{color:colors.muted,fontSize:9,letterSpacing:1,fontWeight:"800"},metricValue:{color:colors.text,fontSize:13,fontWeight:"700"},
  timestamp:{color:colors.muted,fontSize:10,marginTop:spacing.md,lineHeight:15},mapLink:{marginTop:spacing.md,alignSelf:"flex-start"},mapLinkText:{color:colors.accent,fontWeight:"800",fontSize:12},
  section:{gap:spacing.sm,marginTop:spacing.sm},sectionTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},sectionTitle:{color:colors.text,fontSize:18,fontWeight:"800"},
  briefing:{backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.lg,gap:spacing.sm},
  briefingKicker:{color:colors.accent,fontSize:9,fontWeight:"900",letterSpacing:2},briefingText:{color:colors.text,fontSize:14,lineHeight:23},briefingFooter:{color:colors.muted,fontSize:10,lineHeight:15},
  environment:{backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,flexDirection:"row",gap:spacing.sm},
  alert:{backgroundColor:"#392D1B",borderColor:"#80612C",borderWidth:1,borderRadius:radius.md,padding:spacing.md,gap:5},alertTitle:{color:"#FFD68A",fontWeight:"900",fontSize:13},alertText:{color:"#F8E8C7",fontSize:12,lineHeight:18},
  hourly:{gap:spacing.sm,paddingVertical:4},hourCard:{minWidth:76,backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.sm,alignItems:"center",gap:8},
  hourTime:{color:colors.muted,fontSize:10},hourIcon:{fontSize:20},hourTemp:{color:colors.text,fontSize:17,fontWeight:"800"},hourRain:{color:colors.accent,fontSize:10},
  forecast:{backgroundColor:colors.panel,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,paddingHorizontal:spacing.md},
  forecastRow:{minHeight:56,flexDirection:"row",alignItems:"center",gap:6,borderBottomWidth:1,borderBottomColor:colors.border},
  day:{width:40,color:colors.text,fontSize:12,fontWeight:"700"},forecastIcon:{width:23,fontSize:17,textAlign:"center"},forecastCondition:{flex:1,color:colors.muted,fontSize:10},
  high:{color:colors.text,fontSize:12,fontWeight:"700",width:26,textAlign:"right"},low:{color:colors.muted,fontSize:12,width:26,textAlign:"right"},rainChance:{color:colors.accent,fontSize:9,width:42,textAlign:"right"},
  chips:{gap:8},chip:{backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.full,paddingHorizontal:14,paddingVertical:9},chipText:{color:colors.text,fontSize:12,fontWeight:"700"},
  compareButton:{backgroundColor:colors.accent,borderRadius:radius.md,minHeight:46,alignItems:"center",justifyContent:"center",padding:spacing.md},disabled:{opacity:.5},
  compareRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:colors.panel,borderRadius:radius.md,padding:spacing.md,gap:8},
  compareCondition:{color:colors.muted,fontSize:10,flex:1},compareTemp:{color:colors.text,fontSize:16,fontWeight:"800"},
  inlineError:{color:"#FFB4A9",fontSize:12},footer:{color:colors.muted,fontSize:10,lineHeight:16,marginTop:spacing.lg},refresh:{alignSelf:"center",padding:spacing.sm},refreshText:{color:colors.accent,fontWeight:"700"}
});
