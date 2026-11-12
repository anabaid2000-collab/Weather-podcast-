import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { signInAnonymously } from "firebase/auth";
import { auth, db, firebaseApp } from "./firebase";
import { colors, spacing, radius } from "./theme";

export default function PodcastPanel({ current, place }) {
  const [narrator, setNarrator] = useState("Maya");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [script, setScript] = useState("");
  const [audioUri, setAudioUri] = useState(null);
  const [playing, setPlaying] = useState(false);
  const player = useAudioPlayer(audioUri);

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

  async function generate() {
    if (!podcastText) {
      setMessage("Load a city forecast first, then create your briefing.");
      return;
    }
    setBusy(true); setMessage(""); setAudioUri(null); setScript("");
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      const functions = getFunctions(firebaseApp, "us-central1");
      const makeAudio = httpsCallable(functions, "generatePodcast");
      const result = await makeAudio({ text: podcastText, narrator });
      const audioBase64 = result.data?.audioBase64;
      if (!audioBase64) throw new Error("The audio service returned an empty recording.");
      const file = new File(Paths.cache, "skycast-briefing-" + Date.now() + ".mp3");
      file.create({ intermediates: true, overwrite: true });
      await file.write(audioBase64, { encoding: "base64" });
      setAudioUri(file.uri);
      setScript(podcastText);
      try {
        await addDoc(collection(db, "users", auth.currentUser.uid, "podcasts"), {
          city: place.name, narrator, script: podcastText, createdAt: serverTimestamp()
        });
      } catch (saveError) {
        // Audio generation should still succeed if history saving is temporarily unavailable.
      }
      setMessage("Your SkyCast audio briefing is ready.");
    } catch (error) {
      const code = error?.code || "";
      if (code.includes("unauthenticated")) setMessage("Please reload the app and try again.");
      else if (code.includes("functions/not-found") || code.includes("not-found")) setMessage("The audio function is not deployed yet. Follow the Firebase setup steps in the project README.");
      else setMessage(error?.message || "Could not generate audio. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePlayback() {
    if (!audioUri) return;
    try {
      if (playing) { player.pause(); setPlaying(false); }
      else { player.play(); setPlaying(true); }
    } catch {
      setMessage("Audio playback could not start. Please generate the briefing again.");
    }
  }

  useEffect(() => {
    return () => { try { player.pause(); } catch {} };
  }, [player]);

  return <View style={styles.card}>
    <View style={styles.headingRow}>
      <View><Text style={styles.kicker}>SKYCAST AUDIO</Text><Text style={styles.title}>Your weather podcast</Text></View>
      <Text style={styles.mic}>♫</Text>
    </View>
    <Text style={styles.description}>Turn the latest local forecast into a spoken daily briefing.</Text>
    <Text style={styles.label}>CHOOSE YOUR NARRATOR</Text>
    <View style={styles.voiceRow}>
      {["Maya", "Noah"].map((name) => <Pressable key={name} onPress={() => setNarrator(name)} style={[styles.voice, narrator === name && styles.voiceSelected]}>
        <Text style={[styles.voiceText, narrator === name && styles.voiceTextSelected]}>{name}</Text>
        <Text style={styles.voiceSub}>{name === "Maya" ? "Warm voice" : "Calm voice"}</Text>
      </Pressable>)}
    </View>
    <Pressable accessibilityRole="button" disabled={busy || !current} onPress={generate} style={({pressed}) => [styles.generate, (busy || !current) && styles.disabled, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={colors.background}/> : <Text style={styles.generateText}>✦  Generate AI audio</Text>}
    </Pressable>
    {audioUri ? <Pressable accessibilityRole="button" onPress={togglePlayback} style={styles.play}>
      <Text style={styles.playText}>{playing ? "Ⅱ  Pause briefing" : "▶  Play briefing"}</Text>
    </Pressable> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
    {script ? <Text style={styles.scriptPreview} numberOfLines={4}>{script}</Text> : null}
    <Text style={styles.footnote}>AI voice by Google Cloud Text-to-Speech. Audio is generated only when you tap the button.</Text>
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
  scriptPreview:{color:colors.muted,fontSize:11,lineHeight:17},footnote:{color:colors.muted,fontSize:10,lineHeight:15}
});
