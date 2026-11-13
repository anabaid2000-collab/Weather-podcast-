import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Speech from "expo-speech";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "./firebase";
import { colors, spacing, radius } from "./theme";

export default function PodcastPanel({ current, place }) {
  const [narrator, setNarrator] = useState("Maya");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("");

  const podcastText = useMemo(() => {
    if (!current || !place) return "";
    const temp = Math.round(current.temperature_2m);
    const feels = Math.round(current.apparent_temperature);
    const wind = Math.round(current.wind_speed_10m);
    const humidity = current.relative_humidity_2m;
    const rain = current.precipitation;
    const condition = ({
      0:"clear skies",1:"mostly clear skies",2:"partly cloudy skies",3:"overcast skies",
      45:"foggy conditions",48:"foggy conditions",51:"light drizzle",53:"drizzle",55:"heavy drizzle",
      61:"light rain",63:"rain",65:"heavy rain",71:"light snow",73:"snow",75:"heavy snow",
      80:"rain showers",81:"rain showers",82:"heavy rain showers",95:"a thunderstorm",96:"a thunderstorm",99:"a thunderstorm"
    })[current.weather_code] || "changing weather conditions";
    return "Hello, and welcome to your SkyCast weather briefing. Today in " + place.name +
      ", the weather is showing " + condition + ". The current temperature is " + temp +
      " degrees Celsius, and it feels like " + feels + " degrees. Humidity is " + humidity +
      " percent, wind speed is around " + wind + " kilometres per hour, and current precipitation is " +
      rain + " millimetres. Take a moment to plan your day around these conditions. Check the latest local updates before making weather-sensitive plans. That is your SkyCast briefing for " +
      place.name + ". Have a good day, and thanks for listening.";
  }, [current, place]);

  async function saveHistory() {
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      await addDoc(collection(db, "users", auth.currentUser.uid, "podcasts"), {
        city: place.name, narrator, script: podcastText, createdAt: serverTimestamp()
      });
    } catch {
      // Speech works even if optional cloud history saving is unavailable.
    }
  }

  async function generate() {
    if (!podcastText) {
      setMessage("Load a city forecast first, then create your briefing.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await Speech.stop();
      setPlaying(false);
      Speech.speak(podcastText, {
        language: "en-US",
        rate: 0.94,
        pitch: narrator === "Maya" ? 1.08 : 0.92,
        onStart: () => {
          setBusy(false);
          setPlaying(true);
          setMessage(narrator + " is reading your SkyCast briefing.");
        },
        onDone: () => {
          setPlaying(false);
          setMessage("Your SkyCast briefing is complete.");
        },
        onStopped: () => setPlaying(false),
        onError: () => {
          setBusy(false);
          setPlaying(false);
          setMessage("Your phone's text-to-speech engine could not read this briefing. Check its speech settings and try again.");
        }
      });
      void saveHistory();
    } catch (error) {
      setBusy(false);
      setPlaying(false);
      setMessage(error?.message || "Could not start the spoken briefing. Please try again.");
    }
  }

  async function stop() {
    await Speech.stop();
    setBusy(false);
    setPlaying(false);
    setMessage("Briefing stopped.");
  }

  return <View style={styles.card}>
    <View style={styles.headingRow}>
      <View><Text style={styles.kicker}>SKYCAST AUDIO</Text><Text style={styles.title}>Your weather podcast</Text></View>
      <Text style={styles.mic}>♫</Text>
    </View>
    <Text style={styles.description}>Turn the latest local forecast into a spoken daily briefing. Runs on your phone without cloud voice billing.</Text>
    <Text style={styles.label}>CHOOSE YOUR NARRATOR</Text>
    <View style={styles.voiceRow}>
      {["Maya", "Noah"].map((name) => <Pressable key={name} onPress={() => setNarrator(name)} style={[styles.voice, narrator === name && styles.voiceSelected]}>
        <Text style={[styles.voiceText, narrator === name && styles.voiceTextSelected]}>{name}</Text>
        <Text style={styles.voiceSub}>{name === "Maya" ? "Higher pitch" : "Lower pitch"}</Text>
      </Pressable>)}
    </View>
    <Pressable accessibilityRole="button" disabled={busy || playing || !current} onPress={generate} style={({pressed}) => [styles.generate, (busy || playing || !current) && styles.disabled, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={colors.background}/> : <Text style={styles.generateText}>✦  Play weather podcast</Text>}
    </Pressable>
    {playing ? <Pressable accessibilityRole="button" onPress={stop} style={styles.play}>
      <Text style={styles.playText}>■  Stop briefing</Text>
    </Pressable> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
    <Text style={styles.footnote}>Uses your device's built-in speech engine. Voice choices and sound quality depend on the voices installed on your phone. Internet is not needed for speech playback after the forecast loads.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card:{backgroundColor:colors.panel,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,padding:spacing.lg,gap:spacing.md,marginTop:spacing.md},
  headingRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},kicker:{color:colors.accent,fontSize:9,fontWeight:"800",letterSpacing:2},
  title:{color:colors.text,fontSize:19,fontWeight:"800",marginTop:5},mic:{fontSize:30,color:colors.accent},
  description:{color:colors.muted,fontSize:13,lineHeight:20},label:{color:colors.muted,fontSize:9,fontWeight:"800",letterSpacing:1.4},
  voiceRow:{flexDirection:"row",gap:spacing.sm},voice:{flex:1,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,gap:4},
  voiceSelected:{borderColor:colors.accent,backgroundColor:"#1B3552"},voiceText:{color:colors.text,fontSize:14,fontWeight:"800"},
  voiceTextSelected:{color:colors.accent},voiceSub:{color:colors.muted,fontSize:11},
  generate:{minHeight:48,borderRadius:radius.md,backgroundColor:colors.accent,alignItems:"center",justifyContent:"center",padding:spacing.md},
  generateText:{color:colors.background,fontSize:14,fontWeight:"900"},disabled:{opacity:.55},pressed:{opacity:.75},
  play:{minHeight:44,borderRadius:radius.md,borderWidth:1,borderColor:colors.accent,alignItems:"center",justifyContent:"center"},
  playText:{color:colors.accent,fontWeight:"800"},message:{color:colors.text,fontSize:12,lineHeight:18},
  footnote:{color:colors.muted,fontSize:10,lineHeight:15}
});
