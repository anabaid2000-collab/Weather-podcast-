import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Updates from "expo-updates";
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "./src/firebase";
import { addDoc, collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { registerForPushNotificationsAsync } from "./src/notifications";
import { colors, spacing, radius } from "./src/theme";
import ForecastFM from "./src/forecast-fm"; // native Forecast FM integration
import IntelligencePanel from "./src/intelligence-panel";
import { getActivityScores, getWeatherDecisions } from "./src/weather-intelligence";

const FAVORITES_KEY = "skycast.favoriteCities.v1";
const weatherCodes = {
  0:["Clear sky","○"],1:["Mainly clear","◐"],2:["Partly cloudy","◑"],3:["Overcast","≋"],
  45:["Fog","≋"],48:["Rime fog","≋"],51:["Light drizzle","╱"],53:["Drizzle","╱"],55:["Heavy drizzle","╱"],
  56:["Freezing drizzle","╱"],57:["Freezing drizzle","╱"],61:["Light rain","╱"],63:["Rain","╱"],65:["Heavy rain","╱"],
  66:["Freezing rain","╱"],67:["Heavy freezing rain","╱"],71:["Light snow","*"],73:["Snow","*"],75:["Heavy snow","*"],
  77:["Snow grains","*"],80:["Rain showers","╱"],81:["Rain showers","╱"],82:["Heavy showers","ϟ"],
  85:["Snow showers","*"],86:["Heavy snow showers","*"],95:["Thunderstorm","ϟ"],96:["Thunderstorm with hail","ϟ"],99:["Severe thunderstorm","ϟ"]
};
const describe = (code) => weatherCodes[code] || ["Changing conditions","°"];
const dayLabel = (date, index) => index === 0 ? "Today" : new Date(date + "T12:00:00").toLocaleDateString(undefined,{weekday:"short"});
const number = (value, suffix="") => Number.isFinite(value) ? Math.round(value) + suffix : "-";
const clockLabel = (value) => value?.split("T")?.[1]?.slice(0,5) || "-";

async function getCity(name) {
  const response = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(name) + "&count=1&language=en&format=json");
  if (!response.ok) throw new Error("City search is temporarily unavailable.");
  const city = (await response.json()).results?.[0];
  if (!city) throw new Error("City not found. Check the spelling and try again.");
  return city;
}
async function getWeather(city) {
  const base = "https://api.open-meteo.com/v1/forecast?latitude=" + city.latitude + "&longitude=" + city.longitude;
  const forecastUrl = base + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,cloud_cover,visibility&hourly=temperature_2m,precipitation_probability,uv_index,weather_code,relative_humidity_2m,wind_speed_10m,visibility,cloud_cover,pressure_msl&minutely_15=precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max,sunrise,sunset&timezone=auto&forecast_days=7";
  const [forecastResponse, airResponse] = await Promise.all([
    fetch(forecastUrl),
    fetch("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + city.latitude + "&longitude=" + city.longitude + "&hourly=us_aqi,pm2_5,pm10,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=auto&forecast_days=1").catch(() => null)
  ]);
  if (!forecastResponse.ok) throw new Error("Weather service is temporarily unavailable.");
  const forecast = await forecastResponse.json();
  let air = null;
  if (airResponse?.ok) {
    const result = await airResponse.json();
    const times = result.hourly?.time || [];
    const matchingIndex = times.findIndex((time) => time >= forecast.current.time);
    const index = matchingIndex < 0 ? Math.max(0, times.length - 1) : matchingIndex;
    air = { aqi: result.hourly?.us_aqi?.[index], pm25: result.hourly?.pm2_5?.[index], pm10: result.hourly?.pm10?.[index], pollen: { alder: result.hourly?.alder_pollen?.[index], birch: result.hourly?.birch_pollen?.[index], grass: result.hourly?.grass_pollen?.[index], mugwort: result.hourly?.mugwort_pollen?.[index], olive: result.hourly?.olive_pollen?.[index], ragweed: result.hourly?.ragweed_pollen?.[index] } };
  }
  let climate = null;
  try {
    const today = forecast.current.time.slice(0, 10);
    const start = String(Number(today.slice(0, 4)) - 30) + today.slice(4);
    const archiveUrl = "https://archive-api.open-meteo.com/v1/archive?latitude=" + city.latitude + "&longitude=" + city.longitude + "&start_date=" + start + "&end_date=" + today + "&daily=temperature_2m_mean&timezone=auto";
    const archiveResponse = await fetch(archiveUrl);
    if (archiveResponse.ok) {
      const archive = await archiveResponse.json();
      const month = today.slice(5, 7);
      const values = (archive.daily?.time || []).map((date, index) => ({ date, value: Number(archive.daily?.temperature_2m_mean?.[index]) })).filter((item) => item.date?.slice(5, 7) === month && Number.isFinite(item.value));
      if (values.length) {
        const mean = values.reduce((sum, item) => sum + item.value, 0) / values.length;
        climate = { monthlyMean: mean, sampleDays: values.length, periodStart: start, periodEnd: today, currentMean: forecast.daily?.temperature_2m_mean?.[0] ?? forecast.current.temperature_2m };
      }
    }
  } catch {}
  return { forecast, air, climate };
}

export default function App() {
  const [query, setQuery] = useState("Chattogram");
  const [place, setPlace] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState([]);
  const [firebaseUserId, setFirebaseUserId] = useState(null);
  const [pushStatus, setPushStatus] = useState("Not enabled");
  const [compare, setCompare] = useState([]);
  const [comparing, setComparing] = useState(false);
  const latestWeatherRequest = useRef(0);
  const lastWeatherRefresh = useRef(0);
  const [unit, setUnit] = useState("C");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [travelQuery, setTravelQuery] = useState("");
  const [travelResult, setTravelResult] = useState(null);
  const [travelLoading, setTravelLoading] = useState(false);
  const [travelError, setTravelError] = useState("");
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [communityStatus, setCommunityStatus] = useState("");
  const [communityReports, setCommunityReports] = useState([]);
  const [routeDestination, setRouteDestination] = useState("");
  const [routeResult, setRouteResult] = useState(null);
  const [routeStatus, setRouteStatus] = useState("");
  const [page, setPage] = useState("home");
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
      lastWeatherRefresh.current = Date.now();
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

  useEffect(() => {
    let active = true;
    const applyAvailableUpdate = async () => {
      try {
        if (!Updates.isEnabled) return;
        const update = await Updates.checkForUpdateAsync();
        if (!active || !update.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (active) await Updates.reloadAsync();
      } catch (updateError) {
        // Keep the current app usable when update checks or downloads fail.
        console.warn("SkyCast OTA update check failed:", updateError?.message || updateError);
      }
    };
    void applyAvailableUpdate();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!place?.name) return undefined;
    const refreshIfStale = () => {
      if (Date.now() - lastWeatherRefresh.current >= 5 * 60 * 1000) void loadCity(place.name);
    };
    const interval = setInterval(() => {
      if (Date.now() - lastWeatherRefresh.current >= 15 * 60 * 1000) void loadCity(place.name);
    }, 60 * 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshIfStale();
    });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [place?.name, loadCity]);

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

  const enablePushNotifications = async () => {
    if (!firebaseUserId) {
      setPushStatus("Connect to Firebase first");
      return;
    }
    setPushStatus("Requesting permission…");
    try {
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        setPushStatus("Permission not granted or unavailable");
        return;
      }
      await setDoc(doc(db, "users", firebaseUserId), {
        expoPushToken: token,
        pushNotificationsEnabled: true,
        pushTokenUpdatedAt: serverTimestamp()
      }, { merge: true });
      setPushStatus("Enabled on this device");
    } catch (notificationError) {
      setPushStatus(notificationError?.message || "Could not enable notifications");
    }
  };

  const planTravel = async () => {
    if (!travelQuery.trim()) { setTravelError("Enter a destination city."); return; }
    setTravelLoading(true); setTravelError(""); setTravelResult(null);
    try {
      const city = await getCity(travelQuery);
      const [result, alertResponse] = await Promise.all([
        getWeather(city),
        fetch("https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP").catch(() => null)
      ]);
      let alerts = null;
      if (alertResponse?.ok) {
        const feed = await alertResponse.json();
        const features = Array.isArray(feed?.features) ? feed.features : [];
        const country = String(city.country || "").toLowerCase();
        alerts = features.filter((feature) => {
          const p = feature?.properties || {};
          const eventType = String(p.eventtype || p.eventType || "").toUpperCase();
          const countryValue = Array.isArray(p.country) ? p.country.join(" ") : String(p.country || p.countryname || p.countryName || "");
          const active = p.iscurrent === true || String(p.iscurrent).toLowerCase() === "true" || !("iscurrent" in p);
          return active && countryValue.toLowerCase().includes(country) && ["TC","FL","DR","WF"].includes(eventType);
        }).slice(0, 5).map((feature) => {
          const p = feature.properties || {};
          return { name: p.name || p.eventname || p.eventName || p.eventtype || "Regional hazard", type: p.eventtype || p.eventType || "Hazard", level: p.alertlevel || p.alertLevel || "Information", details: p.url || p.reportUrl || p.detailsUrl || null };
        });
      }
      setTravelResult({ city, data: result, alerts });
    } catch (err) { setTravelError(err.message || "Could not load destination forecast."); }
    finally { setTravelLoading(false); }
  };



  useEffect(() => {
    let active = true;
    if (!place?.name) { setCommunityReports([]); return () => { active = false; }; }
    const loadCommunityReports = async () => {
      try {
        const reportsQuery = query(collection(db, "communityWeatherReports"), where("city", "==", place.name), limit(10));
        const snapshot = await getDocs(reportsQuery);
        if (active) setCommunityReports(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      } catch { if (active) setCommunityReports([]); }
    };
    void loadCommunityReports();
    return () => { active = false; };
  }, [place?.name]);

  const checkRouteWeather = async () => {
    const destinationName = routeDestination.trim();
    if (!destinationName) { setRouteStatus("Enter a destination city."); return; }
    if (!place) { setRouteStatus("Your starting city is not available."); return; }
    setRouteStatus("Checking weather at both cities…");
    setRouteResult(null);
    try {
      const destination = await getCity(destinationName);
      const destinationData = await getWeather(destination);
      const summarize = (snapshot) => {
        const c = snapshot?.forecast?.current || {};
        const d = snapshot?.forecast?.daily || {};
        return {
          temperature: c.temperature_2m,
          code: c.weather_code,
          rain: d.precipitation_probability_max?.[0],
          wind: c.wind_speed_10m,
          visibility: c.visibility
        };
      };
      setRouteResult({
        origin: { name: place.name, weather: summarize(data) },
        destination: { name: destination.name, weather: summarize(destinationData) }
      });
      setRouteStatus("Weather snapshots loaded for both cities.");
    } catch (routeError) {
      setRouteStatus(routeError.message || "Could not compare route weather.");
    }
  };

  const reportWeather = async (observation) => {
    if (!place) return;
    if (!firebaseUserId) { setCommunityStatus("Community reports require a temporary Firebase connection. Try again when connected."); return; }
    setCommunityStatus("Submitting observation…");
    try {
      await addDoc(collection(db, "communityWeatherReports"), {
        observation,
        city: place.name,
        country: place.country || null,
        latitudeRounded: Number(Number(place.latitude).toFixed(2)),
        longitudeRounded: Number(Number(place.longitude).toFixed(2)),
        source: "SkyCast community report",
        createdAt: serverTimestamp()
      });
      setCommunityStatus("Your observation was submitted. It is not yet independently verified.");
    } catch (reportError) {
      setCommunityStatus("Could not submit this report. Firestore permissions or connection may need checking.");
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
  const daily = data?.forecast?.daily || {
    precipitation_probability_max: [], uv_index_max: [], sunrise: [], sunset: [],
    time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: []
  };
  const hourly = data?.forecast?.hourly || {
    time: [], temperature_2m: [], precipitation_probability: [], uv_index: [], weather_code: []
  };
  const foundHourIndex = hourly?.time?.findIndex((time) => time >= current?.time) ?? 0;
  const hourlyStart = Math.max(0, foundHourIndex);
  const condition = current ? describe(current.weather_code) : null;
  const localHour = current?.time ? Number(current.time.split("T")[1]?.slice(0,2)) : 12;
  const isRainMode = current && ((current.weather_code >= 51 && current.weather_code <= 67) || (current.weather_code >= 80 && current.weather_code <= 82) || current.weather_code >= 95);
  const weatherMode = isRainMode ? "rain" : (localHour >= 19 || localHour < 6) ? "night" : current?.weather_code <= 1 ? "sunny" : "everyday";
  const briefing = useMemo(() => {
    if (!current || !daily || !place) return "";
    const rain = daily.precipitation_probability_max?.[0] ?? 0;
    const uv = daily.uv_index_max?.[0];
    const advice = rain >= 60 ? "Rain is likely, so consider carrying an umbrella." : rain >= 30 ? "There is some chance of rain; check again before heading out." : "Rain chances look relatively low.";
    const uvAdvice = uv >= 8 ? "UV levels may be very high, so plan shade and sun protection." : uv >= 6 ? "UV levels may be high around midday." : "UV levels look moderate or low.";
    return "Today in " + place.name + ", expect " + describe(current.weather_code)[0].toLowerCase() + " with a temperature of " + Math.round(current.temperature_2m) + "°C, feeling like " + Math.round(current.apparent_temperature) + "°C. Today's high is " + Math.round(daily.temperature_2m_max[0]) + "°C and the low is " + Math.round(daily.temperature_2m_min[0]) + "°C. " + advice + " " + uvAdvice;
  }, [current, daily, place]);

  const homeDecisions = getWeatherDecisions(data?.forecast);
  const homeActivityScores = getActivityScores(data?.forecast);
  const aqi = data?.air?.aqi;
  const aqiLabel = !Number.isFinite(aqi) ? "Unavailable" : aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Sensitive groups" : aqi <= 200 ? "Unhealthy" : aqi <= 300 ? "Very unhealthy" : "Hazardous";

  const smartAlerts = useMemo(() => {
    if (!current || !daily) return [];
    const alerts = [];
    const rain = daily.precipitation_probability_max?.[0] ?? 0;
    const uv = daily.uv_index_max?.[0] ?? 0;
    if (rain >= 60) alerts.push({ icon: "RAIN", title: "Rain likely", detail: rain + "% chance today. Consider carrying an umbrella." });
    if (uv >= 8) alerts.push({ icon: "○", title: "Very high UV", detail: "Plan shade and sun protection around midday." });
    if (Number.isFinite(data?.air?.aqi) && data.air.aqi > 100) alerts.push({ icon: "≋", title: "Air quality alert", detail: "Air quality may affect sensitive groups. Check local conditions before extended outdoor activity." });
    if (current.wind_speed_10m >= 40) alerts.push({ icon: "↝", title: "Strong wind", detail: "Wind speeds are elevated. Take care outdoors." });
    return alerts;
  }, [current, daily, data?.air?.aqi]);

  return <View style={[styles.screen, weatherMode === "night" ? styles.screenNight : weatherMode === "rain" ? styles.screenRain : styles.screenDay]}>
    <StatusBar barStyle={weatherMode === "night" ? "light-content" : "dark-content"} backgroundColor={weatherMode === "night" ? "#101827" : colors.background}/>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <View><Text style={styles.brand}>SKYCAST</Text><Text style={styles.eyebrow}>WEATHER, IN A CLEARER LIGHT</Text></View>
        <Text style={styles.live}>● LIVE DATA</Text>
      </View>
      {page !== "home" ? <Text style={styles.pageHeading}>{({rain:"Rain, Air & Sun",travel:"Travel Planner",forecast:"Your forecast",radio:"Forecast FM",explore:"Explore",intelligence:"Weather Intelligence",dashboard:"Personal Dashboard",more:"More tools"})[page]}</Text> : null}
{page === "home" ? <>
      <Text style={styles.heading}>Weather decisions for {place?.name || "your city"}.</Text>
      <Text style={styles.subheading}>Practical guidance for rain, outdoor plans and changing conditions.</Text>
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

</> : null}
      {loading ? <View style={styles.state}><ActivityIndicator size="large" color={colors.accent}/><Text style={styles.muted}>Consulting the weather bureau…</Text></View>
      : error && !current ? <View style={styles.state}><Text style={styles.weatherIcon}>≋</Text><Text style={styles.cardTitle}>Forecast temporarily unavailable</Text><Text style={styles.muted}>{error}</Text><Pressable onPress={() => loadCity(query)} style={styles.retry}><Text style={styles.buttonText}>Try again</Text></Pressable></View>
      : current && daily ? <>
        {error ? <Text style={styles.inlineError}>{error}</Text> : null}
{page === "radio" ? <ForecastFM place={place} forecast={data.forecast} air={data.air} unit={unit}/> : null}
{page === "intelligence" ? <IntelligencePanel forecast={data.forecast} air={data.air} climate={data.climate} place={place} onAsk={() => setPage("radio")} onReport={reportWeather} reportStatus={communityStatus} reports={communityReports} routeDestination={routeDestination} onRouteDestinationChange={setRouteDestination} onCheckRoute={checkRouteWeather} routeResult={routeResult} routeStatus={routeStatus}/> : null}
 {page === "forecast" ? <View style={styles.section}>
  <Text style={styles.sectionTitle}>The week ahead</Text>
  <Text style={styles.muted}>A seven-day view for {place?.name || "your location"}.</Text>
  <View style={styles.forecast}>
    {daily.time.map((date,i) => { const w=describe(daily.weather_code[i]); return <View key={"forecast-tab-"+date} style={styles.forecastRow}>
      <Text style={styles.day}>{dayLabel(date,i)}</Text><Text style={styles.forecastIcon}>{w[1]}</Text><Text style={styles.forecastCondition}>{w[0]}</Text>
      <Text style={styles.high}>{temp(daily.temperature_2m_max[i])}</Text><Text style={styles.low}>{temp(daily.temperature_2m_min[i])}</Text>
      <Text style={styles.rainChance}>{number(daily.precipitation_probability_max[i],"%")}</Text>
    </View>; })}
  </View>
  <Text style={styles.timestamp}>Hourly details and spoken briefings are available in Forecast FM.</Text>
  <Pressable onPress={()=>setPage("radio")} style={styles.exploreTile}><Text style={styles.exploreTileTitle}>Listen to Forecast FM →</Text><Text style={styles.exploreTileHint}>Choose a presenter and hear today's outlook.</Text></Pressable>
</View> : null}
{page === "explore" ? <View style={styles.section}>
  <Text style={styles.sectionTitle}>Explore your atmosphere</Text>
  <Text style={styles.muted}>Choose a weather tool for {place?.name || "your city"}.</Text>
  {[
    ["rain","Rain, Air & Sun","Rain chances, air quality, UV, sunrise and sunset."],
    ["travel","Travel Planner","Check weather at another destination."],
     ["intelligence","Weather Intelligence","Daily decisions, activity scores, community reports and safety guidance."]
  ].map(([key,title,hint])=><Pressable key={key} onPress={()=>setPage(key)} style={styles.exploreTile}><Text style={styles.exploreTileTitle}>{title}  →</Text><Text style={styles.exploreTileHint}>{hint}</Text></Pressable>)}
</View> : null}
{page === "home" ? <>
        <View style={styles.hero}>
          <WeatherModeScene mode={weatherMode} code={current.weather_code} windSpeed={current.wind_speed_10m} temperature={temp(current.temperature_2m)} feelsLike={temp(current.apparent_temperature)} condition={condition[0]} time={current.time} place={place?.name}/>
          <View style={styles.top}>
            <View style={{flex:1}}><Text style={styles.place}>{place?.name}{place?.admin1 ? ", " + place.admin1 : ""}</Text><Text style={styles.muted}>{place?.country}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={isFavorite ? "Remove saved city" : "Save city"} onPress={toggleFavorite} style={styles.favorite}><Text style={styles.favoriteText}>{isFavorite ? "★ Saved" : "☆ Save city"}</Text></Pressable>
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
</> : null}


{page === "home" ? <>
        <View style={{backgroundColor:"#0F2230",borderRadius:6,padding:16,marginTop:8,gap:8}}>
          <Text style={{color:"#F2B84B",fontSize:10,fontWeight:"800",letterSpacing:1.5}}>FORECAST FM</Text>
          <Text style={{color:"#F8FBFC",fontSize:21,fontWeight:"700"}}>Your weather briefing</Text>
          <Text style={{color:"#C7D8E0",fontSize:12,lineHeight:18}}>A spoken update for {place?.name || "your city"}, using the latest forecast data.</Text>
          <Pressable accessibilityRole="button" onPress={()=>setPage("radio")} style={{alignSelf:"flex-start",backgroundColor:"#F2B84B",borderRadius:3,paddingHorizontal:14,paddingVertical:10}}>
            <Text style={{color:"#0F2230",fontSize:12,fontWeight:"800"}}>Open Forecast FM</Text>
          </Pressable>
        </View>
        <View style={styles.section}>
          <View style={styles.sectionTop}><Text style={styles.sectionTitle}>Your day, decided</Text><Text style={styles.eyebrow}>PRACTICAL GUIDANCE</Text></View>
          <View style={{borderTopWidth:1,borderTopColor:colors.border,paddingTop:12,gap:4}}>
            <Text style={{color:colors.text,fontSize:17,fontWeight:"800"}}>{homeDecisions.umbrella.answer}</Text>
            <Text style={styles.muted}>{homeDecisions.umbrella.detail}</Text>
          </View>
          <View style={{borderTopWidth:1,borderTopColor:colors.border,paddingTop:12,gap:4}}>
            <Text style={{color:colors.text,fontSize:17,fontWeight:"800"}}>{homeDecisions.laundry.answer}</Text>
            <Text style={styles.muted}>{homeDecisions.laundry.detail}</Text>
          </View>
          <View style={{borderTopWidth:1,borderTopColor:colors.border,paddingTop:12,gap:4}}>
            <Text style={styles.eyebrow}>RAIN TIMING</Text>
            <Text style={styles.muted}>{homeDecisions.rainTiming.detail}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={()=>setPage("intelligence")} style={{alignSelf:"flex-start",borderWidth:1,borderColor:colors.border,borderRadius:3,paddingHorizontal:12,paddingVertical:9}}>
            <Text style={{color:colors.accentDark,fontSize:12,fontWeight:"800"}}>More weather intelligence</Text>
          </Pressable>
        </View>
        <View style={styles.section}>
          <View style={styles.sectionTop}><Text style={styles.sectionTitle}>Good for</Text><Text style={styles.eyebrow}>ACTIVITY SCORES</Text></View>
          {homeActivityScores.map(item=><View key={"home-"+item.id} style={{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:5}}>
            <Text style={{color:colors.text,fontSize:12,fontWeight:"700",width:88}}>{item.label}</Text>
            <View style={{height:4,flex:1,backgroundColor:colors.border,overflow:"hidden"}}>
              <View style={{height:4,width:item.score+"%",backgroundColor:colors.accentDark}}/>
            </View>
            <Text style={{color:colors.text,fontSize:12,fontWeight:"800",width:32,textAlign:"right"}}>{item.score}</Text>
          </View>)}
          <Text style={styles.muted}>Planning estimates from rain, wind, UV, visibility and temperature. Not a safety guarantee.</Text>
        </View>
      </> : null}




{page === "rain" ? <>
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

        {daily.precipitation_probability_max?.[0] >= 60 ? <View style={styles.alert}><Text style={styles.alertTitle}>RAIN Rain heads-up</Text><Text style={styles.alertText}>There is a {Math.round(daily.precipitation_probability_max[0])}% chance of precipitation today. Consider carrying an umbrella.</Text></View> : null}

</> : null}


{page === "rain" ? <>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sun & sky</Text>
          <View style={styles.featureCard}>
            <View style={styles.sunRow}>
              <View style={styles.sunMetric}><Text style={styles.sunIcon}>SUNRISE</Text><Text style={styles.featureHint}>SUNRISE</Text><Text style={styles.sunValue}>{daily.sunrise?.[0] ? clockLabel(daily.sunrise[0]) : "-"}</Text></View>
              <View style={styles.sunMetric}><Text style={styles.sunIcon}>SUNSET</Text><Text style={styles.featureHint}>SUNSET</Text><Text style={styles.sunValue}>{daily.sunset?.[0] ? clockLabel(daily.sunset[0]) : "-"}</Text></View>
            </View>
            <Text style={styles.featureText}>Daylight duration · {daily.sunrise?.[0] && daily.sunset?.[0] ? (() => { const minutes = Math.max(0,Math.round((new Date(daily.sunset[0])-new Date(daily.sunrise[0]))/60000)); return Math.floor(minutes/60)+"h "+(minutes%60)+"m"; })() : "Unavailable"}</Text>
          </View>
        </View>

</> : null}


{page === "home" ? <>
        <View style={styles.section}>
          <View style={styles.sectionTop}><Text style={styles.sectionTitle}>Next 12 hours</Text><Text style={styles.eyebrow}>HOURLY</Text></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourly}>
            {hourly?.time?.slice(hourlyStart,hourlyStart+12).map((time,i) => <View key={time} style={styles.hourCard}>
              <Text style={styles.hourTime}>{clockLabel(time)}</Text>
              <Text style={styles.hourIcon}>{describe(hourly.weather_code?.[i+hourlyStart] ?? daily.weather_code[0])[1]}</Text>
              <Text style={styles.hourTemp}>{temp(hourly.temperature_2m[i+hourlyStart])}</Text>
              <Text style={styles.hourRain}>RAIN {number(hourly.precipitation_probability[i+hourlyStart],"%")}</Text>
            </View>)}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTop}><Text style={styles.sectionTitle}>7-day forecast</Text><Text style={styles.eyebrow}>THE WEEK AHEAD</Text></View>
          <View style={styles.forecast}>
            {daily.time.map((date,i) => { const w=describe(daily.weather_code[i]); return <View key={date} style={styles.forecastRow}>
              <Text style={styles.day}>{dayLabel(date,i)}</Text><Text style={styles.forecastIcon}>{w[1]}</Text><Text style={styles.forecastCondition}>{w[0]}</Text>
              <Text style={styles.high}>{temp(daily.temperature_2m_max[i])}</Text><Text style={styles.low}>{temp(daily.temperature_2m_min[i])}</Text>
              <Text style={styles.rainChance}>RAIN {number(daily.precipitation_probability_max[i],"%")}</Text>
            </View>; })}
          </View>
          <Text style={styles.timestamp}>Sunrise {daily.sunrise?.[0] ? clockLabel(daily.sunrise[0]) : "-"} · Sunset {daily.sunset?.[0] ? clockLabel(daily.sunset[0]) : "-"}</Text>
        </View>
      </> : null}



{page === "rain" ? <>
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

</> : null}


{page === "more" ? <>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What should I carry?</Text>
          <View style={styles.featureCard}>
            {(daily.precipitation_probability_max?.[0] >= 40 ? ["RAIN Umbrella or raincoat"] : ["Sunglasses Sunglasses if heading into bright sunshine"]).concat(
              (daily.uv_index_max?.[0] >= 6 ? ["Sun protection Sun protection and a cap"] : []),
              (current?.temperature_2m >= 30 ? ["Water Water bottle"] : current?.temperature_2m <= 18 ? ["Warm layer A light warm layer"] : ["Comfortable shoes Comfortable shoes"]),
              (current?.wind_speed_10m >= 25 ? ["↝ Secure loose items outdoors"] : [])
            ).map((item) => <Text key={item} style={styles.featureText}>{item}</Text>)}
            <Text style={styles.featureHint}>Suggestions are based on the current forecast, not a safety guarantee.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTop}><Text style={styles.sectionTitle}>Rain, Air & Sun</Text><Text style={styles.eyebrow}>7-DAY VIEW</Text></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarRow}>
            {daily.time.map((date,i) => <View key={"calendar-"+date} style={styles.calendarCard}>
              <Text style={styles.featureHint}>{dayLabel(date,i)}</Text>
              <Text style={styles.calendarIcon}>{describe(daily.weather_code[i])[1]}</Text>
              <Text style={styles.featureText}>{temp(daily.temperature_2m_max[i])}</Text>
              <Text style={styles.featureHint}>RAIN {number(daily.precipitation_probability_max?.[i],"%")}</Text>
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
            <Text style={styles.featureHint}>These weather cards appear in SkyCast. Enable device notifications from More to register this phone for remote updates.</Text>
          </View>
        </View>

</> : null}


{page === "dashboard" ? <>
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

</> : null}


{page === "travel" ? <>
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
              {(() => {
                const tc=travelResult.data.forecast.current, rain=travelResult.data.forecast.daily.precipitation_probability_max?.[0]??0, code=tc.weather_code;
                const risks=[(code===95||code===96||code===99)&&"thunderstorms",(code===65||code===82||rain>=70)&&"heavy rain or high rain probability",(code===45||code===48)&&"fog and reduced visibility",tc.wind_speed_10m>=40&&"strong wind"].filter(Boolean);
                const risk=risks.length?"Caution advised: "+risks.join(", ")+". Allow extra time and check local conditions before departure.":"No major weather-related road risk is indicated by this forecast snapshot. Check live traffic and local road reports before leaving.";
                const officialUrl=/Bangladesh/i.test(travelResult.city.country||"")?"https://bmd.gov.bd/":"https://worldweather.wmo.int/";
                return <View style={styles.travelResult}>
                  <Text style={styles.sectionTitle}>Weather-related road conditions</Text>
                  <Text style={styles.featureText}>{risk}</Text>
                  <Text style={styles.timestamp}>Weather-risk estimate only - not a live road-closure, flooding-depth or traffic feed. SkyCast cannot confirm that a road is passable.</Text>
                  <Text style={styles.sectionTitle}>Regional hazard alerts</Text>
                  {travelResult.alerts === null ? <Text style={styles.muted}>The GDACS alert feed could not be reached. Check the official local weather service.</Text> : travelResult.alerts.length ? travelResult.alerts.map((alert,i)=><View key={"gdacs-"+i} style={styles.alert}><Text style={styles.alertTitle}>{alert.level} · {alert.name}</Text><Text style={styles.alertText}>{alert.type} alert reported for {travelResult.city.country}. Check the source details and local instructions.</Text>{alert.details ? <Pressable onPress={()=>Linking.openURL(alert.details)} style={styles.mapLink}><Text style={styles.mapLinkText}>Read alert details →</Text></Pressable> : null}</View>) : <Text style={styles.muted}>No matching current GDACS flood, tropical-cyclone, drought or wildfire alert was found for this country in the latest feed. This does not mean there are no local weather warnings.</Text>}
                  <Text style={styles.timestamp}>Major regional hazard feed: Global Disaster Alert and Coordination System (GDACS). It does not replace local government weather warnings.</Text>
                  <Text style={styles.sectionTitle}>Official weather alerts</Text>
                  <Text style={styles.muted}>For local forecasts and warnings, check the destination's official meteorological service.</Text>
                  <Pressable onPress={()=>Linking.openURL(officialUrl)} style={styles.mapLink}><Text style={styles.mapLinkText}>Open official weather information →</Text></Pressable>
                  <Pressable onPress={()=>Linking.openURL("https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(travelResult.city.name+", "+travelResult.city.country)+"&travelmode=driving")} style={styles.mapLink}><Text style={styles.mapLinkText}>Check driving route and live traffic in Maps →</Text></Pressable>
                </View>;
              })()}
              <Pressable onPress={() => loadCity(travelResult.city.name)} style={styles.mapLink}><Text style={styles.mapLinkText}>Open destination forecast on Home →</Text></Pressable>
            </View> : null}
          </View>
        </View>

</> : null}


{page === "dashboard" ? <>
      <View style={styles.section}>
        <View style={styles.sectionTop}><Text style={styles.sectionTitle}>City comparison</Text><Text style={styles.eyebrow}>YOUR SAVED PLACES</Text></View>
        <Text style={styles.muted}>Save at least two cities to compare their current temperatures.</Text>
        <Pressable accessibilityRole="button" disabled={favorites.length < 2 || comparing} onPress={runComparison} style={[styles.compareButton,(favorites.length<2||comparing)&&styles.disabled]}>
          {comparing ? <ActivityIndicator color={colors.background}/> : <Text style={styles.buttonText}>Compare saved cities ({favorites.length})</Text>}
        </Pressable>
        {compare.map((item) => <View key={item.name} style={styles.compareRow}><Text style={styles.place}>{item.name}</Text><Text style={styles.compareCondition}>{describe(item.code)[1]} {describe(item.code)[0]}</Text><Text style={styles.compareTemp}>{number(item.temperature,"°C")}</Text></View>)}
      </View>
</> : null}



      {page === "more" ? <View style={styles.section}>
        <Pressable accessibilityRole="button" onPress={() => place && Linking.openURL("https://www.openstreetmap.org/?mlat="+place.latitude+"&mlon="+place.longitude+"#map=10/"+place.latitude+"/"+place.longitude)} style={styles.toolButton}><Text style={styles.toolButtonTitle}>⌖  Open Live Weather Map</Text><Text style={styles.toolButtonHint}>View the selected city on an interactive map</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setPage("dashboard")} style={styles.toolButton}><Text style={styles.toolButtonTitle}>★  Saved cities & settings</Text><Text style={styles.toolButtonHint}>Manage favourite places and temperature units</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setPage("rain")} style={styles.toolButton}><Text style={styles.toolButtonTitle}>○  Weather calendar</Text><Text style={styles.toolButtonHint}>See the seven-day outlook and daylight times</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setPage("rain")} style={styles.toolButton}><Text style={styles.toolButtonTitle}>RAIN  Rain, Air & Sun</Text><Text style={styles.toolButtonHint}>Rain, air quality, UV and daylight</Text></Pressable>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device notifications</Text>
          <View style={styles.featureCard}>
            <Text style={styles.muted}>Allow SkyCast to send weather updates to this device. You can change notification permission in Android settings.</Text>
            <Pressable accessibilityRole="button" disabled={!firebaseUserId} onPress={enablePushNotifications} style={[styles.toolButton,!firebaseUserId&&styles.disabled]}>
              <Text style={styles.toolButtonTitle}>Enable push notifications</Text>
              <Text style={styles.toolButtonHint}>{pushStatus}</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.muted}>More tools use the same live forecast. Some map details open in your browser.</Text>
      </View> : null}
      <Text style={styles.footer}>{offlineCopy ? "Offline mode · Showing your last saved forecast. Reconnect to refresh live data. " : ""}Weather and air-quality data by Open-Meteo. Forecasts are estimates and can change.</Text>
      <Pressable onPress={() => loadCity(place?.name || query)} style={styles.refresh}><Text style={styles.refreshText}>↻  Refresh the forecast</Text></Pressable>
      </> : null}
    </ScrollView>
    <View style={styles.bottomNav}>
      {[
        ["home","Home","⌂"],["forecast","Forecast","◷"],["explore","Explore","◇"],["radio","Radio","◉"],["more","More","•••"]
      ].map(([key,label,symbol]) => {
        const selected = key === page || (key === "explore" && ["rain","travel","intelligence"].includes(page)) || (key === "more" && page === "dashboard");
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{selected}} onPress={()=>setPage(key)} style={styles.bottomNavItem}>
          <Text style={[styles.bottomNavIcon,selected&&styles.bottomNavIconActive]}>{symbol}</Text>
          <Text style={[styles.bottomNavLabel,selected&&styles.bottomNavLabelActive]}>{label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

function WeatherModeScene({mode,code,windSpeed=0,temperature,feelsLike,condition,time,place}) {
  const reduced = useReducedMotion();
  const float = useSharedValue(0);
  const pulse = useSharedValue(0);
  const rain = mode === "rain";
  const night = mode === "night";
  const sunny = mode === "sunny";
  const palette = night
    ? {sky:"#14263F",ground:"#263D5A",accent:"#E7B96D",text:"#FFFFFF"}
    : rain
      ? {sky:"#2F4B69",ground:"#40607F",accent:"#D6E8FF",text:"#FFFFFF"}
      : sunny
        ? {sky:"#FFE9B8",ground:"#9ADBB0",accent:"#E9A25B",text:"#1D2B3A"}
        : {sky:"#203E5B",ground:"#365A78",accent:"#E7B96D",text:"#FFFFFF"};
  const headline = "Current conditions for " + (place || "your city");
  const subtitle = "Live conditions and forecast details for your location.";
  useEffect(() => {
    if (reduced) { float.set(0); pulse.set(0); return; }
    float.set(0);
    pulse.set(0);
    return () => { cancelAnimation(float); cancelAnimation(pulse); };
  },[reduced,float,pulse,mode]);
  const floatStyle = useAnimatedStyle(() => ({transform:[{translateY:float.get()}]}));
  const glowStyle = useAnimatedStyle(() => ({opacity:0.35+pulse.get()*0.2,transform:[{scale:0.92+pulse.get()*0.12}]}));
  const symbol = rain ? "╱" : night ? "◐" : sunny ? "○" : "◑";
  return <View style={[styles.modeScene,{backgroundColor:palette.sky}]}>
    <View style={[styles.modeGlow,{backgroundColor:palette.accent}]}/>
    <View style={styles.modeTopline}>
      <View><Text style={[styles.modeEyebrow,{color:palette.accent}]}>{mode.toUpperCase()} MODE</Text><Text style={[styles.modePlace,{color:palette.text}]}>{place || "Your location"}</Text></View>
      <Text style={[styles.modeTime,{color:palette.text}]}>{time?.split("T")?.[1]?.slice(0,5) || "LOCAL TIME"}</Text>
    </View>
    <Animated.View style={[styles.modeWeatherArt,floatStyle]}>
      <Animated.View style={[styles.modeHalo,{backgroundColor:palette.accent},glowStyle]}/>
      <Text style={styles.modeWeatherIcon}>{symbol}</Text>
      {rain ? <Text style={styles.modeRainMarks}>╱   ╱   ╱   ╱   ╱</Text> : null}
      {night ? <Text style={styles.modeStars}>✦       ✧       ·       ✦</Text> : null}
      {sunny ? <Text style={styles.modeSunRays}>✦       ✧       ✦</Text> : null}
    </Animated.View>
    <View style={[styles.modeHorizon,{backgroundColor:palette.ground}]}/>
    <View style={styles.modeBottom}>
      <View style={{flex:1}}>
        <Text style={[styles.modeTemperature,{color:palette.text}]}>{temperature || "-"}</Text>
        <Text style={[styles.modeCondition,{color:palette.text}]}>{condition || "Weather update"}</Text>
        <Text style={[styles.modeSubtitle,{color:palette.text}]}>{subtitle}</Text>
      </View>
      <View style={styles.modeFeels}>
        <Text style={[styles.modeFeelsLabel,{color:palette.accent}]}>FEELS LIKE</Text>
        <Text style={[styles.modeFeelsValue,{color:palette.text}]}>{feelsLike || "-"}</Text>
        <Text style={[styles.modeWind,{color:palette.text}]}>↝ {number(windSpeed," km/h")} wind</Text>
      </View>
    </View>
    <Text style={[styles.modeCaption,{color:palette.text}]}>{headline}</Text>
  </View>;
}

function WeatherScene({code,windSpeed=0}) {
  const reduced = useReducedMotion();
  const bob = useSharedValue(0);
  const drift = useSharedValue(0);
  const rain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  const snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const storm = code >= 95;
  const fog = code === 45 || code === 48;
  const sunny = code <= 1;
  const partlyCloudy = code === 2;
  const windy = windSpeed >= 25;
  const skyColor = storm ? "#77838A" : rain ? "#AFC2C8" : snow ? "#DCE5E6" : fog ? "#D5DAD5" : sunny ? "#EBDCB8" : "#DCE9E5";
  const hillBack = storm ? "#8E9A8C" : snow ? "#C7D7D4" : rain ? "#9DBAA5" : "#A9C49B";
  const hillFront = storm ? "#687E75" : snow ? "#A9C5C2" : rain ? "#7FA58E" : "#7FA985";
  const action = storm ? "Froggy is watching the distant thunder." : snow ? "Froggy bundled up for a snowy day." : rain ? "Froggy is keeping dry under a little umbrella." : windy ? "A breezy day! Froggy is chasing a drifting leaf." : fog ? "Froggy is exploring the misty morning." : sunny ? "Froggy is enjoying a golden sunny day." : partlyCloudy ? "Froggy is playing between sun and clouds." : "Froggy is watching the clouds roll by.";
  useEffect(() => {
    if (reduced) { bob.set(0); drift.set(0); return; }
    bob.set(0);
    drift.set(0);
    return () => { cancelAnimation(bob); cancelAnimation(drift); };
  },[reduced,bob,drift,snow,sunny,windy]);
  const frogStyle = useAnimatedStyle(() => ({transform:[{translateY:bob.get()}]}));
  const cloudStyle = useAnimatedStyle(() => ({transform:[{translateX:drift.get()}]}));
  return <View style={[styles.weatherScene,{backgroundColor:skyColor}]}>
    <View style={[styles.sceneSky,{backgroundColor:skyColor}]}/>
    {sunny || partlyCloudy ? <View style={[styles.sceneSunDisc,{opacity:sunny?1:0.55}]}/> : null}
    <Animated.View style={[styles.vectorCloud,cloudStyle]}>
      <View style={[styles.cloudPuffLarge,(rain||storm||fog)&&{backgroundColor:"#E3E6E1"}]}/>
      <View style={[styles.cloudPuffSmall,(rain||storm||fog)&&{backgroundColor:"#E3E6E1"}]}/>
      <View style={[styles.cloudBase,(rain||storm||fog)&&{backgroundColor:"#E3E6E1"}]}/>
    </Animated.View>
    {rain ? <View style={styles.rainDrops}>
      {[0,1,2,3,4,5].map((n)=><View key={n} style={[styles.rainDrop,{left:12+n*27,top:n%2?68:58,backgroundColor:storm?"#D9E3E5":"#6AAFC2"}]}/>)}
    </View> : null}
    {snow ? <Text style={styles.sceneSnow}>✳   *   ✳</Text> : null}
    {storm ? <Text style={styles.sceneLightning}>ϟ</Text> : null}
    {windy ? <Animated.Text style={[styles.windLeaf,cloudStyle]}>↝</Animated.Text> : null}
    {fog ? <View style={styles.fogBand}/> : null}
    <View style={[styles.sceneHillBack,{backgroundColor:hillBack}]}/>
    <View style={[styles.sceneHillFront,{backgroundColor:hillFront}]}/>
    {rain ? <View style={styles.laundry}>
      <View style={styles.laundryLine}/>
      <View style={[styles.laundryPeg,{left:38}]}/>
      <View style={[styles.laundryPeg,{left:91}]}/>
      <View style={[styles.laundryPeg,{left:143}]}/>
      <View style={[styles.laundryShirt,{left:29,backgroundColor:"#F4A7A7"}]}/>
      <View style={[styles.laundryShirt,{left:82,backgroundColor:"#F4D27B"}]}/>
      <View style={[styles.laundryShirt,{left:135,backgroundColor:"#A9D9D1"}]}/>
    </View> : <View style={styles.mushroomHouse}>
      <View style={styles.mushroomCap}/><View style={styles.mushroomStem}/>
      <View style={styles.mushroomDoor}/>
    </View>}
    <Animated.View style={[styles.flatFrog,frogStyle]}>
      <View style={styles.frogEyes}><View style={styles.frogEye}><View style={styles.frogPupil}/></View><View style={styles.frogEye}><View style={styles.frogPupil}/></View></View>
      <View style={styles.frogFace}><View style={styles.frogCheek}/><View style={styles.frogMouth}/><View style={styles.frogCheek}/></View>
      {rain ? <View style={styles.frogUmbrella}><View style={styles.umbrellaCanopy}/><View style={styles.umbrellaHandle}/></View> : null}
      {sunny ? <View style={styles.frogSunglasses}><View/><View/></View> : null}
      {snow || windy ? <View style={styles.frogScarf}/> : null}
    </Animated.View>
    <View style={styles.sceneGround}/>
    <View style={styles.sceneCaption}><Text style={styles.sceneCaptionText}>{action}</Text></View>
  </View>;
}
function CatWeatherScene({code,windSpeed=0}) {
  const reduced = useReducedMotion();
  const catBob = useSharedValue(0);
  const firePulse = useSharedValue(0);
  const rain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  const snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const storm = code >= 95;
  const fog = code === 45 || code === 48;
  const sunny = code <= 1;
  const windy = windSpeed >= 25;
  const sky = storm ? "#596B83" : rain ? "#91A9BC" : snow ? "#B8CAD5" : fog ? "#B9C7C9" : sunny ? "#D8B98E" : "#888ED7";
  const caption = storm ? "A cozy shelter while the storm passes" : snow ? "A warm little camp on a snowy night" : rain ? "Listening to the rain by the fire" : windy ? "A breezy evening under the stars" : sunny ? "A golden evening at the campsite" : "A quiet night beneath the clouds";
  useEffect(() => {
    if (reduced) { catBob.set(0); firePulse.set(0); return; }
    catBob.set(0);
    firePulse.set(0);
    return () => { cancelAnimation(catBob); cancelAnimation(firePulse); };
  },[reduced,catBob,firePulse]);
  const catStyle = useAnimatedStyle(() => ({transform:[{translateY:catBob.get()}]}));
  const flameStyle = useAnimatedStyle(() => ({opacity:0.78+firePulse.get()*0.22,transform:[{scale:0.94+firePulse.get()*0.12}]}));
  return <View style={[styles.catScene,{backgroundColor:sky}]}>
    <View style={styles.catMoon}/>
    <View style={styles.catStars}><Text style={styles.catStar}>✦</Text><Text style={styles.catStar}>✧</Text><Text style={styles.catStar}>·</Text></View>
    {fog ? <View style={styles.catFog}/>:null}
    {rain ? <View style={styles.catRain}><Text style={styles.catRainMarks}>╱  ╱  ╱  ╱  ╱  ╱</Text></View>:null}
    {snow ? <Text style={styles.catSnow}>✳     *      ✳</Text>:null}
    {storm ? <Text style={styles.catBolt}>ϟ</Text>:null}
    <View style={styles.catFarHill}/>
    <View style={styles.catPineLeft}><View style={styles.catPineTop}/><View style={styles.catPineMid}/><View style={styles.catPineLow}/><View style={styles.catPineTrunk}/></View>
    <View style={styles.catPineRight}><View style={styles.catPineTop}/><View style={styles.catPineMid}/><View style={styles.catPineLow}/><View style={styles.catPineTrunk}/></View>
    <View style={styles.catTent}><View style={styles.catTentDoor}/><View style={styles.catTentGlow}/></View>
    <View style={styles.catGround}/>
    <Animated.View style={[styles.catCharacter,catStyle]}>
      <View style={styles.catTail}/>
      <View style={styles.catBody}/>
      <View style={styles.catPawLeft}/>
      <View style={styles.catPawRight}/>
      <View style={styles.catEarLeft}/>
      <View style={styles.catEarRight}/>
      <View style={styles.catHead}>
        <View style={styles.catEyeLeft}/><View style={styles.catEyeRight}/>
        <View style={styles.catNose}/><View style={styles.catSmile}/>
        <View style={styles.catWhiskerLeft}/><View style={styles.catWhiskerRight}/>
        <View style={styles.catCheekLeft}/><View style={styles.catCheekRight}/>
      </View>
      {snow || windy ? <View style={styles.catScarf}/>:null}
      {rain ? <View style={styles.catHood}/> : null}
    </Animated.View>
    <View style={styles.catCampfireGlow}/>
    <View style={styles.catLogs}><View style={styles.catLogOne}/><View style={styles.catLogTwo}/></View>
    <Animated.View style={[styles.catFlames,flameStyle]}>
      <View style={styles.catFlameOuter}/><View style={styles.catFlameMid}/><View style={styles.catFlameCore}/>
    </Animated.View>
    <View style={styles.catCaption}><Text style={styles.catCaptionText}>{caption}</Text></View>
  </View>;
}

function WeatherMotion({children}) {
  const reducedMotion = useReducedMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      drift.set(0);
      return;
    }
    drift.set(0);
    return () => cancelAnimation(drift);
  }, [reducedMotion, drift]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drift.get() }]
  }));
  return <Animated.View style={[styles.heroIconMotion, animatedStyle]}>
    <View style={styles.mascotSparkleOne}><Text style={styles.mascotSparkle}>✦</Text></View>
    <View style={styles.mascotSparkleTwo}><Text style={styles.mascotSparkle}>✧</Text></View>
    {children}
    <View style={styles.mascotFace}>
      <View style={styles.mascotEye}/>
      <View style={styles.mascotEye}/>
      <Text style={styles.mascotSmile}>⌣</Text>
    </View>
  </Animated.View>;
}

function SkyBuddy() {
  const reducedMotion = useReducedMotion();
  const bob = useSharedValue(0);
  const sparkle = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) { bob.set(0); sparkle.set(0); return; }
    bob.set(0);
    sparkle.set(0);
    return () => { cancelAnimation(bob); cancelAnimation(sparkle); };
  }, [reducedMotion, bob, sparkle]);
  const buddyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.get() }, { rotate: (bob.get() * -0.45) + "deg" }]
  }));
  const sparkleStyle = useAnimatedStyle(() => ({ opacity: 0.35 + sparkle.get() * 0.65, transform: [{ scale: 0.8 + sparkle.get() * 0.25 }] }));
  return <Animated.View style={[styles.buddyWrap, buddyStyle]} accessibilityLabel="Animated smiling sky mascot">
    <Animated.Text style={[styles.buddySparkle, styles.buddySparkleLeft, sparkleStyle]}>✦</Animated.Text>
    <Animated.Text style={[styles.buddySparkle, styles.buddySparkleRight, sparkleStyle]}>✧</Animated.Text>
    <View style={styles.buddyCloud}>
      <View style={styles.buddyEyes}><View style={styles.buddyEye}/><View style={styles.buddyEye}/></View>
      <View style={styles.buddySmile}/>
      <View style={styles.buddyCheekLeft}/><View style={styles.buddyCheekRight}/>
    </View>
    <View style={styles.buddyBase}/>
  </Animated.View>;
}

function Metric({label,value}) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  modeScene:{height:286,borderRadius:22,overflow:"hidden",position:"relative",marginBottom:16,padding:16,justifyContent:"space-between"},
  modeGlow:{position:"absolute",top:72,right:36,width:124,height:124,borderRadius:70,opacity:0.12},
  modeTopline:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",zIndex:2},
  modeEyebrow:{fontSize:9,fontWeight:"900",letterSpacing:2},
  modePlace:{fontSize:17,fontWeight:"800",marginTop:5},
  modeTime:{fontSize:11,fontWeight:"700",marginTop:3,opacity:0.8},
  modeWeatherArt:{position:"absolute",top:66,right:34,width:150,height:110,alignItems:"center",justifyContent:"center",zIndex:2},
  modeHalo:{position:"absolute",width:100,height:100,borderRadius:60,opacity:0.4},
  modeWeatherIcon:{fontSize:70,textAlign:"center"},
  modeRainMarks:{position:"absolute",top:83,color:"#D6E8FF",fontSize:14,letterSpacing:3},
  modeStars:{position:"absolute",top:2,left:-18,right:-18,color:"#FFE5B5",fontSize:15,textAlign:"center"},
  modeSunRays:{position:"absolute",top:0,left:-12,right:-12,color:"#E9A25B",fontSize:15,textAlign:"center"},
  modeHorizon:{position:"absolute",left:-30,right:-30,bottom:70,height:70,borderTopLeftRadius:100,borderTopRightRadius:100,opacity:0.5},
  modeBottom:{flexDirection:"row",alignItems:"flex-end",justifyContent:"space-between",zIndex:3,marginTop:"auto"},
  modeTemperature:{fontSize:49,fontWeight:"300",letterSpacing:-2},
  modeCondition:{fontSize:14,fontWeight:"800",marginTop:-3},
  modeSubtitle:{fontSize:10,opacity:0.82,marginTop:5},
  modeFeels:{alignItems:"flex-end",paddingBottom:5,gap:4},
  modeFeelsLabel:{fontSize:8,fontWeight:"900",letterSpacing:1.2},
  modeFeelsValue:{fontSize:17,fontWeight:"800"},
  modeWind:{fontSize:9,opacity:0.85},
  modeCaption:{fontSize:10,fontWeight:"800",opacity:0.8,zIndex:3,marginTop:6},
  catScene:{height:224,borderRadius:20,overflow:"hidden",position:"relative",marginBottom:16,borderWidth:1,borderColor:"#D8C8AE"},
  catMoon:{position:"absolute",top:18,right:35,width:27,height:27,borderRadius:14,backgroundColor:"#F8E8C4",opacity:.9},
  catStars:{position:"absolute",top:14,left:25,right:90,flexDirection:"row",justifyContent:"space-between"},
  catStar:{color:"#FFF3D5",fontSize:17,fontWeight:"900"},
  catFog:{position:"absolute",top:86,left:-10,right:-10,height:20,borderRadius:20,backgroundColor:"rgba(255,255,255,0.28)"},
  catRain:{position:"absolute",top:50,left:15,right:15},
  catRainMarks:{color:"#DCEAF2",fontSize:16,letterSpacing:7},
  catSnow:{position:"absolute",top:55,left:25,color:"#FFFFFF",fontSize:17},
  catBolt:{position:"absolute",top:45,right:92,color:"#F8D88A",fontSize:34,fontWeight:"900"},
  catFarHill:{position:"absolute",bottom:37,left:-20,right:-20,height:95,borderTopLeftRadius:120,borderTopRightRadius:120,backgroundColor:"#617B80",opacity:.75},
  catPineLeft:{position:"absolute",bottom:43,left:18,width:48,height:102,alignItems:"center"},
  catPineRight:{position:"absolute",bottom:42,right:17,width:48,height:110,alignItems:"center"},
  catPineTop:{position:"absolute",top:0,width:0,height:0,borderLeftWidth:17,borderRightWidth:17,borderBottomWidth:35,borderLeftColor:"transparent",borderRightColor:"transparent",borderBottomColor:"#456B63"},
  catPineMid:{position:"absolute",top:20,width:0,height:0,borderLeftWidth:23,borderRightWidth:23,borderBottomWidth:42,borderLeftColor:"transparent",borderRightColor:"transparent",borderBottomColor:"#3E665D"},
  catPineLow:{position:"absolute",top:43,width:0,height:0,borderLeftWidth:27,borderRightWidth:27,borderBottomWidth:43,borderLeftColor:"transparent",borderRightColor:"transparent",borderBottomColor:"#355D55"},
  catPineTrunk:{position:"absolute",bottom:0,width:8,height:19,backgroundColor:"#765D4B"},
  catTent:{position:"absolute",bottom:42,left:68,width:112,height:91,backgroundColor:"#C47B62",borderTopLeftRadius:62,borderTopRightRadius:62,borderBottomLeftRadius:8,borderBottomRightRadius:8,transform:[{skewX:"-7deg"}],borderWidth:2,borderColor:"#E9B68D"},
  catTentDoor:{position:"absolute",bottom:0,left:36,width:38,height:59,backgroundColor:"#654E56",borderTopLeftRadius:28,borderTopRightRadius:28},
  catTentGlow:{position:"absolute",bottom:10,left:47,width:16,height:28,borderRadius:10,backgroundColor:"#F7C77A",opacity:.75},
  catGround:{position:"absolute",bottom:0,left:0,right:0,height:48,backgroundColor:"#405F56"},
  catCharacter:{position:"absolute",bottom:35,left:"34%",width:112,height:115,alignItems:"center",zIndex:4},
  catTail:{position:"absolute",bottom:13,left:0,width:48,height:18,borderWidth:9,borderColor:"#B96F48",borderLeftColor:"transparent",borderBottomColor:"#B96F48",borderRadius:24,transform:[{rotate:"-22deg"}]},
  catBody:{position:"absolute",bottom:7,left:24,width:76,height:65,borderRadius:42,backgroundColor:"#D78D58",borderWidth:2,borderColor:"#A95F3F"},
  catPawLeft:{position:"absolute",bottom:3,left:37,width:28,height:17,borderRadius:12,backgroundColor:"#F1C49A",borderWidth:1,borderColor:"#A95F3F",zIndex:2},
  catPawRight:{position:"absolute",bottom:3,left:65,width:28,height:17,borderRadius:12,backgroundColor:"#F1C49A",borderWidth:1,borderColor:"#A95F3F",zIndex:2},
  catEarLeft:{position:"absolute",top:4,left:23,width:0,height:0,borderLeftWidth:14,borderRightWidth:5,borderBottomWidth:27,borderLeftColor:"transparent",borderRightColor:"transparent",borderBottomColor:"#C77A4C",transform:[{rotate:"-13deg"}],zIndex:2},
  catEarRight:{position:"absolute",top:2,right:20,width:0,height:0,borderLeftWidth:5,borderRightWidth:14,borderBottomWidth:28,borderLeftColor:"transparent",borderRightColor:"transparent",borderBottomColor:"#C77A4C",transform:[{rotate:"13deg"}],zIndex:2},
  catHead:{position:"absolute",top:15,left:19,width:76,height:67,borderRadius:38,backgroundColor:"#E5A66F",borderWidth:2,borderColor:"#A95F3F",zIndex:3},
  catEyeLeft:{position:"absolute",top:28,left:21,width:5,height:7,borderRadius:4,backgroundColor:"#493C3A"},
  catEyeRight:{position:"absolute",top:28,right:21,width:5,height:7,borderRadius:4,backgroundColor:"#493C3A"},
  catNose:{position:"absolute",top:39,left:34,width:8,height:6,borderRadius:5,backgroundColor:"#A85F65"},
  catSmile:{position:"absolute",top:43,left:34,width:8,height:6,borderBottomWidth:1.5,borderColor:"#684844",borderRadius:8},
  catWhiskerLeft:{position:"absolute",top:44,left:3,width:20,height:1,backgroundColor:"#F8E6CD",transform:[{rotate:"-8deg"}]},
  catWhiskerRight:{position:"absolute",top:44,right:3,width:20,height:1,backgroundColor:"#F8E6CD",transform:[{rotate:"8deg"}]},
  catCheekLeft:{position:"absolute",top:43,left:13,width:10,height:5,borderRadius:6,backgroundColor:"#E58C83"},
  catCheekRight:{position:"absolute",top:43,right:13,width:10,height:5,borderRadius:6,backgroundColor:"#E58C83"},
  catScarf:{position:"absolute",top:75,left:25,width:66,height:10,borderRadius:6,backgroundColor:"#7897A2",borderWidth:1,borderColor:"#E8D4B8",zIndex:5},
  catHood:{position:"absolute",top:9,left:15,width:83,height:75,borderWidth:5,borderColor:"#D7B98D",borderRadius:42,zIndex:1},
  catCampfireGlow:{position:"absolute",bottom:19,left:"57%",width:74,height:55,borderRadius:40,backgroundColor:"#ECA65D",opacity:.22},
  catLogs:{position:"absolute",bottom:28,left:"59%",width:57,height:17,zIndex:4},
  catLogOne:{position:"absolute",top:4,left:0,width:59,height:10,borderRadius:7,backgroundColor:"#785544",transform:[{rotate:"17deg"}]},
  catLogTwo:{position:"absolute",top:4,left:0,width:59,height:10,borderRadius:7,backgroundColor:"#A16A4D",transform:[{rotate:"-17deg"}]},
  catFlames:{position:"absolute",bottom:38,left:"65%",width:36,height:48,zIndex:5},
  catFlameOuter:{position:"absolute",bottom:0,left:2,width:31,height:42,borderTopLeftRadius:25,borderTopRightRadius:25,borderBottomLeftRadius:16,borderBottomRightRadius:16,backgroundColor:"#F07845",transform:[{rotate:"7deg"}]},
  catFlameMid:{position:"absolute",bottom:0,left:9,width:20,height:31,borderTopLeftRadius:18,borderTopRightRadius:18,borderBottomLeftRadius:12,borderBottomRightRadius:12,backgroundColor:"#FFC05F",transform:[{rotate:"-7deg"}]},
  catFlameCore:{position:"absolute",bottom:0,left:14,width:10,height:18,borderTopLeftRadius:10,borderTopRightRadius:10,borderBottomLeftRadius:7,borderBottomRightRadius:7,backgroundColor:"#FFF0B8"},
  catCaption:{position:"absolute",bottom:7,left:10,right:10,alignItems:"center",zIndex:6},
  catCaptionText:{color:"#FFF8E9",fontSize:10,fontWeight:"800",backgroundColor:"rgba(40,55,63,0.62)",paddingHorizontal:12,paddingVertical:5,borderRadius:20,overflow:"hidden"},

  screen:{flex:1,backgroundColor:colors.background},screenDay:{backgroundColor:"#EEF6F7"},screenRain:{backgroundColor:"#BFE0EE"},screenNight:{backgroundColor:"#08131F"},content:{padding:spacing.lg,paddingTop:48,paddingBottom:112,gap:spacing.md},
  bottomNav:{position:"absolute",left:12,right:12,bottom:12,minHeight:64,backgroundColor:"#0F2230",borderRadius:6,borderWidth:1,borderColor:"rgba(255,255,255,0.16)",flexDirection:"row",alignItems:"center",justifyContent:"space-around",paddingHorizontal:5,paddingVertical:6,elevation:6,shadowColor:"#0F2230",shadowOpacity:.12,shadowRadius:8,shadowOffset:{width:0,height:3}},
  bottomNavItem:{flex:1,minHeight:50,alignItems:"center",justifyContent:"center",gap:3,borderRadius:4},
  bottomNavIcon:{fontSize:19,color:"#9DB5C4",fontWeight:"700"},
  bottomNavIconActive:{color:"#F2B84B"},
  bottomNavLabel:{fontSize:10,color:"#9DB5C4",fontWeight:"600"},
  bottomNavLabelActive:{color:"#F2B84B",fontWeight:"900"},
  exploreTile:{backgroundColor:"#F8FBFC",borderWidth:1,borderColor:"rgba(16,34,47,0.17)",borderRadius:6,padding:16,gap:5,marginTop:8},
  exploreTileTitle:{color:"#10222F",fontSize:15,fontWeight:"800"},
  exploreTileHint:{color:"#48606F",fontSize:12,lineHeight:18},
  pageNav:{flexDirection:"row",flexWrap:"wrap",gap:8,paddingVertical:12,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.border},
  pageNavButton:{paddingHorizontal:14,paddingVertical:10,borderRadius:radius.sm,borderWidth:1,borderColor:colors.border,backgroundColor:colors.panel},
  pageNavButtonActive:{backgroundColor:colors.navy,borderColor:colors.navy},
  pageNavText:{color:colors.text,fontSize:12,fontWeight:"800"},
  pageNavTextActive:{color:colors.panel},
  pageHeading:{color:colors.navy,fontSize:26,fontWeight:"700",fontFamily:"serif",letterSpacing:0,marginTop:spacing.sm,marginBottom:spacing.xs},
  welcomeSticker:{flexDirection:"row",alignItems:"center",gap:12,backgroundColor:colors.panelAlt,borderWidth:1,borderColor:colors.brass,borderRadius:radius.lg,padding:14,marginTop:spacing.sm},
  welcomeEmoji:{fontSize:30},
  buddyWrap:{width:64,height:54,alignItems:"center",justifyContent:"center",marginRight:2},
  buddyCloud:{width:48,height:36,borderRadius:22,backgroundColor:"#E8C98F",alignItems:"center",justifyContent:"center",borderWidth:1.5,borderColor:"#FFF6E8",shadowColor:"#C58A52",shadowOpacity:0.3,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:3},
  buddyBase:{position:"absolute",bottom:7,width:32,height:9,borderRadius:8,backgroundColor:"#E8C98F"},
  buddyEyes:{flexDirection:"row",gap:10,marginTop:3},
  buddyEye:{width:4,height:6,borderRadius:4,backgroundColor:"#39434A"},
  buddySmile:{width:9,height:5,borderBottomWidth:1.8,borderColor:"#39434A",borderRadius:8,marginTop:1},
  buddyCheekLeft:{position:"absolute",left:8,top:21,width:6,height:3,borderRadius:4,backgroundColor:"#F5A6A6"},
  buddyCheekRight:{position:"absolute",right:8,top:21,width:6,height:3,borderRadius:4,backgroundColor:"#F5A6A6"},
  buddySparkle:{position:"absolute",color:"#C58A52",fontSize:16,fontWeight:"900",zIndex:2},
  buddySparkleLeft:{left:2,top:0},
  buddySparkleRight:{right:1,top:8},
  welcomeTitle:{color:colors.navy,fontSize:14,fontWeight:"800",fontFamily:"serif"},
  welcomeCopy:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:3},
  welcomeStar:{color:"#C58A52",fontSize:23},
  mascotSparkleOne:{position:"absolute",top:7,left:10},
  mascotSparkleTwo:{position:"absolute",right:9,top:17},
  mascotSparkle:{color:"#C58A52",fontSize:17,fontWeight:"900"},
  mascotFace:{position:"absolute",bottom:9,left:34,flexDirection:"row",alignItems:"center",gap:5,backgroundColor:"#FFF6E8",borderRadius:12,paddingHorizontal:6,paddingVertical:1},
  mascotEye:{width:4,height:4,borderRadius:2,backgroundColor:"#39434A"},
  mascotSmile:{fontSize:10,color:"#39434A",fontWeight:"900",marginTop:-3},
  toolButton:{backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.lg,gap:6},
  toolButtonTitle:{color:colors.text,fontSize:15,fontWeight:"800"},
  toolButtonHint:{color:colors.muted,fontSize:11,lineHeight:16},
  top:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},brand:{color:"#DCEAF2",fontSize:25,fontWeight:"900",letterSpacing:1.1},
  eyebrow:{color:colors.muted,fontSize:9,letterSpacing:1.2,marginTop:4},live:{color:colors.accent,fontSize:9,fontWeight:"800",letterSpacing:1},
  heading:{color:"#DCEAF2",fontSize:30,fontWeight:"800",letterSpacing:-.7,marginTop:spacing.sm},subheading:{color:colors.muted,fontSize:14,marginTop:-5,lineHeight:21},
  searchRow:{flexDirection:"row",gap:spacing.sm,marginTop:spacing.sm},input:{flex:1,minHeight:48,borderRadius:radius.md,paddingHorizontal:spacing.md,color:colors.text,backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,fontSize:15},
  button:{backgroundColor:colors.accent,borderRadius:radius.sm,justifyContent:"center",paddingHorizontal:spacing.lg,borderWidth:1,borderColor:colors.accentDark},buttonText:{color:colors.background,fontWeight:"800"},
  state:{minHeight:180,backgroundColor:colors.panel,borderRadius:radius.lg,justifyContent:"center",alignItems:"center",padding:spacing.lg,gap:spacing.sm},
  muted:{color:colors.muted,fontSize:12,lineHeight:19},weatherIcon:{fontSize:38},cardTitle:{color:colors.text,fontSize:18,fontWeight:"800"},
  retry:{backgroundColor:colors.accent,borderRadius:radius.md,paddingHorizontal:spacing.lg,paddingVertical:spacing.sm,marginTop:spacing.sm},
  weatherScene:{height:178,borderRadius:radius.md,overflow:"hidden",backgroundColor:colors.sky,marginBottom:16,position:"relative",borderWidth:2,borderColor:colors.brass},
  sceneSky:{...StyleSheet.absoluteFillObject,backgroundColor:"#C6D8D1"},
  sceneSunDisc:{position:"absolute",top:19,right:30,width:36,height:36,borderRadius:18,backgroundColor:"#FFD36E",opacity:.95},
  vectorCloud:{position:"absolute",top:20,left:30,width:92,height:48,zIndex:2},
  cloudPuffLarge:{position:"absolute",left:23,top:0,width:43,height:38,borderRadius:24,backgroundColor:"#F8FCFF"},
  cloudPuffSmall:{position:"absolute",left:4,top:14,width:38,height:28,borderRadius:20,backgroundColor:"#F8FCFF"},
  cloudBase:{position:"absolute",left:0,bottom:0,width:88,height:22,borderRadius:14,backgroundColor:"#F8FCFF"},
  rainDrops:{position:"absolute",left:26,top:56,width:170,height:65,zIndex:2},
  rainDrop:{position:"absolute",width:5,height:13,borderRadius:5,backgroundColor:"#54B9D5",transform:[{rotate:"18deg"}]},
  sceneSnow:{position:"absolute",top:74,right:22,color:"#FFFFFF",fontSize:18},
  sceneLightning:{position:"absolute",top:65,right:53,color:"#F6D37B",fontSize:34,fontWeight:"900"},
  windLeaf:{position:"absolute",top:89,left:155,fontSize:24,zIndex:3},
  fogBand:{position:"absolute",top:88,left:-12,right:-12,height:18,backgroundColor:"rgba(255,255,255,0.42)",borderRadius:20,zIndex:2},
  sceneHillBack:{position:"absolute",bottom:25,left:-18,right:-18,height:76,backgroundColor:"#829B82",borderTopLeftRadius:100,borderTopRightRadius:100},
  sceneHillFront:{position:"absolute",bottom:0,left:-18,right:-18,height:48,backgroundColor:"#55796D",borderTopLeftRadius:100,borderTopRightRadius:100},
  laundry:{position:"absolute",right:18,top:23,width:190,height:85,zIndex:3},
  laundryLine:{position:"absolute",top:23,left:10,right:0,height:2,backgroundColor:"#617F8C",transform:[{rotate:"-8deg"}]},
  laundryPeg:{position:"absolute",top:17,width:3,height:11,backgroundColor:"#D9B978",borderRadius:2},
  laundryShirt:{position:"absolute",top:28,width:31,height:40,borderBottomLeftRadius:8,borderBottomRightRadius:8,borderTopLeftRadius:5,borderTopRightRadius:5},
  mushroomHouse:{position:"absolute",left:25,bottom:27,width:64,height:72,alignItems:"center",zIndex:3},
  mushroomCap:{position:"absolute",top:0,width:64,height:36,borderTopLeftRadius:38,borderTopRightRadius:38,borderBottomLeftRadius:15,borderBottomRightRadius:15,backgroundColor:"#D96E69"},
  mushroomStem:{position:"absolute",top:30,width:28,height:40,borderRadius:12,backgroundColor:"#F2DDB2"},
  mushroomDoor:{position:"absolute",top:43,width:12,height:22,borderTopLeftRadius:8,borderTopRightRadius:8,backgroundColor:"#A87962"},
  flatFrog:{position:"absolute",left:"43%",bottom:23,width:78,height:75,alignItems:"center",zIndex:4},
  frogEyes:{position:"absolute",top:0,left:12,right:12,flexDirection:"row",justifyContent:"space-between",zIndex:2},
  frogEye:{width:23,height:25,borderRadius:14,backgroundColor:"#F8F4D9",borderWidth:2,borderColor:"#4C8E68",alignItems:"center",justifyContent:"center"},
  frogPupil:{width:10,height:13,borderRadius:7,backgroundColor:"#243D39"},
  frogFace:{position:"absolute",top:20,left:2,right:2,height:45,borderRadius:25,backgroundColor:"#6EBB7C",borderWidth:2,borderColor:"#4C9667",flexDirection:"row",alignItems:"center",justifyContent:"space-around",paddingHorizontal:7},
  frogCheek:{width:9,height:6,borderRadius:6,backgroundColor:"#E99591"},
  frogMouth:{width:24,height:9,borderBottomWidth:2,borderColor:"#285B48",borderRadius:12,marginTop:3},
  frogUmbrella:{position:"absolute",top:-19,right:-5,width:40,height:45,alignItems:"center"},
  umbrellaCanopy:{width:38,height:20,backgroundColor:"#E7A0A0",borderTopLeftRadius:25,borderTopRightRadius:25,borderBottomLeftRadius:8,borderBottomRightRadius:8},
  umbrellaHandle:{width:2,height:22,backgroundColor:"#826A57"},
  frogSunglasses:{position:"absolute",top:7,left:15,right:15,flexDirection:"row",justifyContent:"space-between",gap:3},
  frogScarf:{position:"absolute",top:58,left:12,width:55,height:9,borderRadius:6,backgroundColor:"#C98565",borderWidth:1,borderColor:"#F4D7B8",transform:[{rotate:"-5deg"}]},
  sceneGround:{position:"absolute",bottom:0,left:0,right:0,height:23,backgroundColor:colors.tealDark,opacity:0.9},
  sceneCaption:{position:"absolute",bottom:7,left:10,right:10,alignItems:"center",zIndex:5},
  sceneCaptionText:{color:"#244B4A",fontSize:10,fontWeight:"800",backgroundColor:"rgba(255,255,255,0.88)",paddingHorizontal:12,paddingVertical:5,borderRadius:20,overflow:"hidden"},
  hero:{backgroundColor:"#FFFFFF",borderRadius:24,borderWidth:1,borderColor:"#D8E7F5",padding:spacing.md,shadowColor:"#2A6CA4",shadowOpacity:0.10,shadowRadius:16,shadowOffset:{width:0,height:5},elevation:3},
  place:{color:colors.text,fontSize:16,fontWeight:"800"},favorite:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:10,paddingVertical:7},favoriteText:{color:colors.accent,fontSize:11,fontWeight:"800"},
  heroIcon:{fontSize:48},heroIconMotion:{width:94,height:94,alignItems:"center",justifyContent:"center",borderRadius:30,backgroundColor:"#E6D8C3",borderWidth:1,borderColor:"#C7B394",shadowColor:"#B66A45",shadowOpacity:0.16,shadowRadius:14,shadowOffset:{width:0,height:5},elevation:4},temperature:{color:"#287FC5",fontSize:76,fontWeight:"300",letterSpacing:-3,marginTop:12},
  condition:{color:colors.text,fontSize:17,fontWeight:"700",marginTop:-4},metrics:{flexDirection:"row",borderTopWidth:1,borderTopColor:colors.border,marginTop:spacing.lg,paddingTop:spacing.md,justifyContent:"space-between",gap:8},
  metric:{gap:5,flex:1},metricLabel:{color:colors.muted,fontSize:9,letterSpacing:1,fontWeight:"800"},metricValue:{color:colors.text,fontSize:13,fontWeight:"700"},
  timestamp:{color:colors.muted,fontSize:10,marginTop:spacing.md,lineHeight:15},mapLink:{marginTop:spacing.md,alignSelf:"flex-start"},mapLinkText:{color:colors.accent,fontWeight:"800",fontSize:12},
  section:{gap:spacing.sm,marginTop:spacing.sm},sectionTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},sectionTitle:{color:"#DCEAF2",fontSize:19,fontWeight:"800",letterSpacing:-.2},
  briefing:{backgroundColor:colors.panel,borderWidth:1,borderColor:colors.brass,borderRadius:radius.lg,padding:spacing.lg,gap:spacing.sm},
  briefingKicker:{color:colors.accent,fontSize:9,fontWeight:"800",letterSpacing:2},briefingText:{color:colors.text,fontSize:14,lineHeight:23},briefingFooter:{color:colors.muted,fontSize:10,lineHeight:15},
  environment:{backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,flexDirection:"row",gap:spacing.sm},
  alert:{backgroundColor:"#F0E5D1",borderColor:colors.brass,borderWidth:1,borderRadius:radius.md,padding:spacing.md,gap:5},alertTitle:{color:colors.accentDark,fontWeight:"800",fontSize:13},alertText:{color:colors.text,fontSize:12,lineHeight:18},
  hourly:{gap:spacing.sm,paddingVertical:4},hourCard:{minWidth:76,backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.sm,alignItems:"center",gap:8},
  hourTime:{color:colors.muted,fontSize:10},hourIcon:{fontSize:20},hourTemp:{color:colors.text,fontSize:17,fontWeight:"800"},hourRain:{color:colors.accent,fontSize:10},
  forecast:{backgroundColor:colors.panel,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,paddingHorizontal:spacing.md},
  forecastRow:{minHeight:56,flexDirection:"row",alignItems:"center",gap:6,borderBottomWidth:1,borderBottomColor:colors.border},
  day:{width:40,color:colors.text,fontSize:12,fontWeight:"700"},forecastIcon:{width:23,fontSize:17,textAlign:"center"},forecastCondition:{flex:1,color:colors.muted,fontSize:10},
  high:{color:colors.text,fontSize:12,fontWeight:"700",width:26,textAlign:"right"},low:{color:colors.muted,fontSize:12,width:26,textAlign:"right"},rainChance:{color:colors.accent,fontSize:9,width:42,textAlign:"right"},
  chips:{gap:8},chip:{backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:14,paddingVertical:9},chipText:{color:colors.text,fontSize:12,fontWeight:"700"},
  compareButton:{backgroundColor:colors.navy,borderRadius:radius.sm,minHeight:46,alignItems:"center",justifyContent:"center",padding:spacing.md,borderWidth:1,borderColor:colors.brass},disabled:{opacity:.5},
  compareRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:colors.panel,borderRadius:radius.md,padding:spacing.md,gap:8},
  compareCondition:{color:colors.muted,fontSize:10,flex:1},compareTemp:{color:colors.text,fontSize:16,fontWeight:"800"},
  inlineError:{color:"#A34F42",fontSize:12},
  featureCard:{backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,gap:spacing.sm},
  featureHint:{color:colors.muted,fontSize:9,letterSpacing:1,fontWeight:"800"},featureText:{color:colors.text,fontSize:13,fontWeight:"600"},
  rainRow:{flexDirection:"row",alignItems:"center",gap:10},rainTrack:{flex:1,height:7,backgroundColor:colors.border,borderRadius:9,overflow:"hidden"},rainFill:{height:7,backgroundColor:colors.accent,borderRadius:9},rainValue:{color:colors.accent,fontSize:11,fontWeight:"800",width:36,textAlign:"right"},
  sunRow:{flexDirection:"row",justifyContent:"space-around"},sunMetric:{alignItems:"center",gap:5},sunIcon:{fontSize:28},sunValue:{color:colors.text,fontSize:20,fontWeight:"800"},
  calendarRow:{gap:8},calendarCard:{width:88,backgroundColor:colors.panel,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.sm,alignItems:"center",gap:8},calendarIcon:{fontSize:24},
  settingRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},settingValue:{color:colors.accent,fontWeight:"900",fontSize:12},alertLine:{borderTopWidth:1,borderTopColor:colors.border,paddingTop:spacing.sm,gap:4},
  unitRow:{flexDirection:"row",gap:8},unitButton:{flex:1,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.sm,alignItems:"center"},unitActive:{backgroundColor:colors.navy,borderColor:colors.navy},unitText:{color:colors.text,fontSize:12,fontWeight:"700"},unitTextActive:{color:colors.background},travelResult:{borderTopWidth:1,borderTopColor:colors.border,paddingTop:spacing.md,gap:6},
  footer:{color:colors.muted,fontSize:10,lineHeight:16,marginTop:spacing.lg},refresh:{alignSelf:"center",padding:spacing.sm},refreshText:{color:colors.teal,fontWeight:"800"}
});
