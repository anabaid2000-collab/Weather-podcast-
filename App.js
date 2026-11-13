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
  const [unit, setUnit] = useState("C");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [travelQuery, setTravelQuery] = useState("");
  const [travelResult, setTravelResult] = useState(null);
  const [travelLoading, setTravelLoading] = useState(false);
  const [travelError, setTravelError] = useState("");
  const [offlineCopy, setOfflineCopy] = useState(false);
  const temp = (value) => number(unit === "F" && Number.isFinite(value) ? value * 9 / 5 + 32 : value, "°" + unit);


  const loadCity = useCallback(async (name) => {
    const value = name.trim();
    if (!value) { setError("Enter a city name."); return; }
    const requestId = ++latestWeatherRequest.current;
    setLoading(true); setError("");
    try {
      const city = await getCity(value);
      const result = await getWeather(city);
      if (requestId !== latestWeatherRequest.current) return;
      setPlace(city); setData(result); setQuery(city.name); setCompare([]); setOfflineCopy(false);
      try { await AsyncStorage.setItem("skycast.lastWeather.v1", JSON.stringify({ place: city, data: result, savedAt: Date.now() })); } catch {}
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
        const cached = await AsyncStorage.getItem("skycast.lastWeather.v1");
        if (cached) {
          const saved = JSON.parse(cached);
          if (saved?.place && saved?.data?.forecast?.current) {
            if (active) { setPlace(saved.place); setData(saved.data); setQuery(saved.place.name); setLoading(false); setOfflineCopy(true); }
          }
        }
        const localPrefs = await AsyncStorage.getItem("skycast.preferences.v1");
        if (localPrefs) {
          const prefs = JSON.parse(localPrefs);
          if (active) { setUnit(prefs.unit === "F" ? "F" : "C"); setAlertsEnabled(prefs.alertsEnabled !== false); }
        }
        if (active) setFavorites(localCities);
      } catch {}
      try {
        const credential = await signInAnonymously(auth);
        const userId = credential.user.uid;
        const userRef = doc(db, "users", userId);
        const snapshot = await getDoc(userRef);
        const remoteCities = snapshot.exists() ? cleanCities(snapshot.data().favoriteCities) : [];
        const remotePrefs = snapshot.exists() ? snapshot.data().preferences : null;
        if (remotePrefs && active) {
          setUnit(remotePrefs.unit === "F" ? "F" : "C");
          setAlertsEnabled(remotePrefs.alertsEnabled !== false);
          await AsyncStorage.setItem("skycast.preferences.v1", JSON.stringify({ unit: remotePrefs.unit === "F" ? "F" : "C", alertsEnabled: remotePrefs.alertsEnabled !== false }));
        }
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
  const savePreferences = async (next) => {
    if (next.unit) setUnit(next.unit);
    if (typeof next.alertsEnabled === "boolean") setAlertsEnabled(next.alertsEnabled);
    const prefs = { unit: next.unit || unit, alertsEnabled: typeof next.alertsEnabled === "boolean" ? next.alertsEnabled : alertsEnabled };
    try { await AsyncStorage.setItem("skycast.preferences.v1", JSON.stringify(prefs)); } catch {}
    if (firebaseUserId) {
      try { await setDoc(doc(db, "users", firebaseUserId), { preferences: prefs, updatedAt: serverTimestamp() }, { merge: true }); } catch {}
    }
  };

  const planTravel = async () => {
    if (!travelQuery.trim()) { setTravelError("Enter a destination city."); return; }
    setTravelLoading(true); setTravelError(""); setTravelResult(null);
    try {
      const city = await getCity(travelQuery);
      const result = await getWeather(city);
      setTravelResult({ city, data: result });
    } catch (err) { setTravelError(err.message || "Could not load destination forecast."); }
    finally { setTravelLoading(false); }
  };

  const smartAlerts = useMemo(() => {
    if (!current || !daily) return [];
    const alerts = [];
    const rain = daily.precipitation_probability_max?.[0] ?? 0;
    const uv = daily.uv_index_max?.[0] ?? 0;
    if (rain >= 60) alerts.push({ icon: "☂️", title: "Rain likely", detail: rain + "% chance today. Consider carrying an umbrella." });
    if (uv >= 8) alerts.push({ icon: "☀️", title: "Very high UV", detail: "Plan shade and sun protection around midday." });
    if (Number.isFinite(aqi) && aqi > 100) alerts.push({ icon: "🌫️", title: "Air quality alert", detail: "Air quality may affect sensitive groups. Check local conditions before extended outdoor activity." });
    if (current.wind_speed_10m >= 40) alerts.push({ icon: "💨", title: "Strong wind", detail: "Wind speeds are elevated. Take care outdoors." });
    return alerts;
  }, [current, daily, aqi]);

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
          <Text style={styles.temperature}>{temp(current.temperature_2m)}</Text>
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
              <Text style={styles.hourTemp}>{temp(hourly.temperature_2m[i+hourlyStart])}</Text>
              <Text style={styles.hourRain}>☂ {number(hourly.precipitation_probability[i+hourlyStart],"%")}</Text>
            </View>)}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTop}><Text style={styles.sectionTitle}>7-day forecast</Text><Text style={styles.eyebrow}>THE WEEK AHEAD</Text></View>
          <View style={styles.forecast}>
            {daily.time.map((date,i) => { const w=describe(daily.weather_code[i]); return <View key={date} style={styles.forecastRow}>
              <Text style={styles.day}>{dayLabel(date,i)}</Text><Text style={styles.forecastIcon}>{w[1]}</Text><Text style={styles.forecastCondition}>{w[0]}</Text>
              <Text style={styles.high}>{temp(daily.temperature_2m_max[i])}</Text><Text style={styles.low}>{temp(daily.temperature_2m_min[i])}</Text>
              <Text style={styles.rainChance}>☂ {number(daily.precipitation_probability_max[i],"%")}</Text>
            </View>; })}
          </View>
          <Text style={styles.timestamp}>Sunrise {daily.sunrise?.[0] ? clockLabel(daily.sunrise[0]) : "—"} · Sunset {daily.sunset?.[0] ? clockLabel(daily.sunset[0]) : "—"}</Text>
        </View>
      </> : null}


        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rain predictor</Text>
          <View style={styles.featureCard}>
            <Text style={styles.featureHint}>NEXT 12 HOURS · CHANCE OF RAIN</Text>
            {hourly?.time?.slice(hourlyStart,hourlyStart+12).map((time,i) => {
              const chance = hourly.precipitation_probability?.[i+hourlyStart] ?? 0;
              return <View key={"rain-"+time} style={styles.rainRow}>
                <Text style={styles.featureText}>{clockLabel(time)}</Text>
                <View style={styles.rainTrack}><View style={[styles.rainFill,{width:Math.max(0,Math.min(100,chance))+"%"}]}/></View>
                <Text style={styles.rainValue}>{Math.round(chance)}%</Text>
              </View>;
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sky & sun tracker</Text>
          <View style={styles.featureCard}>
            <View style={styles.sunRow}>
              <View style={styles.sunMetric}><Text style={styles.sunIcon}>🌅</Text><Text style={styles.featureHint}>SUNRISE</Text><Text style={styles.sunValue}>{daily.sunrise?.[0] ? clockLabel(daily.sunrise[0]) : "—"}</Text></View>
              <View style={styles.sunMetric}><Text style={styles.sunIcon}>🌇</Text><Text style={styles.featureHint}>SUNSET</Text><Text style={styles.sunValue}>{daily.sunset?.[0] ? clockLabel(daily.sunset[0]) : "—"}</Text></View>
            </View>
            <Text style={styles.featureText}>Daylight duration · {daily.sunrise?.[0] && daily.sunset?.[0] ? (() => { const minutes = Math.max(0,Math.round((new Date(daily.sunset[0])-new Date(daily.sunrise[0]))/60000)); return Math.floor(minutes/60)+"h "+(minutes%60)+"m"; })() : "Unavailable"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What should I carry?</Text>
          <View style={styles.featureCard}>
            {(daily.precipitation_probability_max?.[0] >= 40 ? ["☂️ Umbrella or raincoat"] : ["🕶️ Sunglasses if heading into bright sunshine"]).concat(
              (daily.uv_index_max?.[0] >= 6 ? ["🧴 Sun protection and a cap"] : []),
              (current.temperature_2m >= 30 ? ["💧 Water bottle"] : current.temperature_2m <= 18 ? ["🧥 A light warm layer"] : ["👟 Comfortable shoes"]),
              (current.wind_speed_10m >= 25 ? ["💨 Secure loose items outdoors"] : [])
            ).map((item) => <Text key={item} style={styles.featureText}>{item}</Text>)}
            <Text style={styles.featureHint}>Suggestions are based on the current forecast, not a safety guarantee.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTop}><Text style={styles.sectionTitle}>Weather calendar</Text><Text style={styles.eyebrow}>7-DAY VIEW</Text></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarRow}>
            {daily.time.map((date,i) => <View key={"calendar-"+date} style={styles.calendarCard}>
              <Text style={styles.featureHint}>{dayLabel(date,i)}</Text>
              <Text style={styles.calendarIcon}>{describe(daily.weather_code[i])[1]}</Text>
              <Text style={styles.featureText}>{temp(daily.temperature_2m_max[i])}</Text>
              <Text style={styles.featureHint}>☂ {number(daily.precipitation_probability_max?.[i],"%")}</Text>
            </View>)}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Smart weather alerts</Text>
          <View style={styles.featureCard}>
            <Pressable onPress={() => savePreferences({alertsEnabled:!alertsEnabled})} style={styles.settingRow}>
              <Text style={styles.featureText}>Show weather alerts in SkyCast</Text>
              <Text style={styles.settingValue}>{alertsEnabled ? "ON" : "OFF"}</Text>
            </Pressable>
            {alertsEnabled ? (smartAlerts.length ? smartAlerts.map((alert) => <View key={alert.title} style={styles.alertLine}><Text style={styles.featureText}>{alert.icon}  {alert.title}</Text><Text style={styles.muted}>{alert.detail}</Text></View>) : <Text style={styles.muted}>No high-priority weather alerts for this forecast.</Text>) : <Text style={styles.muted}>Weather alert cards are currently turned off.</Text>}
            <Text style={styles.featureHint}>These are in-app alerts. Device notifications can be added in a later setup step.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal dashboard</Text>
          <View style={styles.featureCard}>
            <Text style={styles.featureText}>Temperature unit</Text>
            <View style={styles.unitRow}>
              <Pressable onPress={() => savePreferences({unit:"C"})} style={[styles.unitButton,unit==="C"&&styles.unitActive]}><Text style={[styles.unitText,unit==="C"&&styles.unitTextActive]}>Celsius °C</Text></Pressable>
              <Pressable onPress={() => savePreferences({unit:"F"})} style={[styles.unitButton,unit==="F"&&styles.unitActive]}><Text style={[styles.unitText,unit==="F"&&styles.unitTextActive]}>Fahrenheit °F</Text></Pressable>
            </View>
            <Text style={styles.featureHint}>Your preferences are saved on this device and synced to Firebase when signed in.</Text>
            <Text style={styles.featureText}>Saved places · {favorites.length}/6</Text>
            <Text style={styles.muted}>Your favourite cities and unit preference stay available after reopening SkyCast.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Travel weather planner</Text>
          <View style={styles.featureCard}>
            <Text style={styles.muted}>Check the forecast for a destination before you travel.</Text>
            <View style={styles.searchRow}>
              <TextInput accessibilityLabel="Travel destination" value={travelQuery} onChangeText={setTravelQuery} onSubmitEditing={planTravel} returnKeyType="search" placeholder="Destination city" placeholderTextColor={colors.muted} style={styles.input}/>
              <Pressable onPress={planTravel} style={styles.button}><Text style={styles.buttonText}>Check</Text></Pressable>
            </View>
            {travelLoading ? <ActivityIndicator color={colors.accent}/> : null}
            {travelError ? <Text style={styles.inlineError}>{travelError}</Text> : null}
            {travelResult ? <View style={styles.travelResult}>
              <Text style={styles.place}>{travelResult.city.name}, {travelResult.city.country}</Text>
              <Text style={styles.compareTemp}>{temp(travelResult.data.forecast.current.temperature_2m)} · {describe(travelResult.data.forecast.current.weather_code)[0]}</Text>
              <Text style={styles.muted}>Feels like {temp(travelResult.data.forecast.current.apparent_temperature)} · Rain chance today {number(travelResult.data.forecast.daily.precipitation_probability_max?.[0],"%")}</Text>
              <Pressable onPress={() => loadCity(travelResult.city.name)} style={styles.mapLink}><Text style={styles.mapLinkText}>Open destination forecast on Home →</Text></Pressable>
            </View> : null}
          </View>
        </View>

      <View style={styles.section}>
        <View style={styles.sectionTop}><Text style={styles.sectionTitle}>City comparison</Text><Text style={styles.eyebrow}>YOUR SAVED PLACES</Text></View>
        <Text style={styles.muted}>Save at least two cities to compare their current temperatures.</Text>
        <Pressable accessibilityRole="button" disabled={favorites.length < 2 || comparing} onPress={runComparison} style={[styles.compareButton,(favorites.length<2||comparing)&&styles.disabled]}>
          {comparing ? <ActivityIndicator color={colors.background}/> : <Text style={styles.buttonText}>Compare saved cities ({favorites.length})</Text>}
        </Pressable>
        {compare.map((item) => <View key={item.name} style={styles.compareRow}><Text style={styles.place}>{item.name}</Text><Text style={styles.compareCondition}>{describe(item.code)[1]} {describe(item.code)[0]}</Text><Text style={styles.compareTemp}>{number(item.temperature,"°C")}</Text></View>)}
      </View>
      <Text style={styles.footer}>{offlineCopy ? "Offline mode · Showing your last saved forecast. Reconnect to refresh live data. " : ""}Weather and air-quality data by Open-Meteo. Forecasts are estimates and can change.</Text>
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
  inlineError:{color:"#FFB4A9",fontSize:12},
  featureCard:{backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,gap:spacing.sm},
  featureHint:{color:colors.muted,fontSize:9,letterSpacing:1,fontWeight:"800"},featureText:{color:colors.text,fontSize:13,fontWeight:"600"},
  rainRow:{flexDirection:"row",alignItems:"center",gap:10},rainTrack:{flex:1,height:7,backgroundColor:colors.border,borderRadius:9,overflow:"hidden"},rainFill:{height:7,backgroundColor:colors.accent,borderRadius:9},rainValue:{color:colors.accent,fontSize:11,fontWeight:"800",width:36,textAlign:"right"},
  sunRow:{flexDirection:"row",justifyContent:"space-around"},sunMetric:{alignItems:"center",gap:5},sunIcon:{fontSize:28},sunValue:{color:colors.text,fontSize:20,fontWeight:"800"},
  calendarRow:{gap:8},calendarCard:{width:88,backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.sm,alignItems:"center",gap:8},calendarIcon:{fontSize:24},
  settingRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},settingValue:{color:colors.accent,fontWeight:"900",fontSize:12},alertLine:{borderTopWidth:1,borderTopColor:colors.border,paddingTop:spacing.sm,gap:4},
  unitRow:{flexDirection:"row",gap:8},unitButton:{flex:1,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.sm,alignItems:"center"},unitActive:{backgroundColor:colors.accent,borderColor:colors.accent},unitText:{color:colors.text,fontSize:12,fontWeight:"700"},unitTextActive:{color:colors.background},travelResult:{borderTopWidth:1,borderTopColor:colors.border,paddingTop:spacing.md,gap:6},
  footer:{color:colors.muted,fontSize:10,lineHeight:16,marginTop:spacing.lg},refresh:{alignSelf:"center",padding:spacing.sm},refreshText:{color:colors.accent,fontWeight:"700"}
});
