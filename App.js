import React, { useEffect, useState } from "react";
import { SafeAreaView, View, Text, Switch, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { auth, db } from "./src/firebase";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

const LANGUAGES = ["English", "বাংলা", "Español", "Français", "Italiano", "Deutsch", "Português"];

export default function App() {
  const [uid, setUid] = useState(null);
  const [language, setLanguage] = useState("English");
  const [voice, setVoice] = useState("Maya · Female");
  const [reminder, setReminder] = useState(true);
  const [status, setStatus] = useState("Connecting to SkyCast…");

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    (async () => {
      try {
        if (!auth.currentUser) await signInAnonymously(auth);
        unsubscribe = onAuthStateChanged(auth, async user => {
          if (!user || !active) return;
          setUid(user.uid);
          try {
            const ref = doc(db, "users", user.uid);
            const snap = await getDoc(ref);
            if (snap.exists()) {
              const p = snap.data();
              if (p.language) setLanguage(p.language);
              if (p.voice) setVoice(p.voice);
              if (typeof p.reminder === "boolean") setReminder(p.reminder);
            }
            if (active) setStatus("Connected · preferences loaded");
          } catch (e) { if (active) setStatus("Signed in, but Firestore read failed: " + e.message); }
        });
      } catch (e) { if (active) setStatus("Firebase sign-in failed: " + e.message); }
    })();
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!uid) return;
    const save = async () => {
      try {
        await setDoc(doc(db, "users", uid), { language, voice, reminder, updatedAt: new Date().toISOString() }, { merge: true });
        setStatus("Connected · preferences saved");
      } catch (e) { setStatus("Save failed: " + e.message); }
    };
    save();
  }, [uid, language, voice, reminder]);

  return <SafeAreaView style={s.page}>
    <Text style={s.brand}>✦ SKYCAST</Text>
    <Text style={s.tag}>WEATHER, WITH A VOICE</Text>
    <View style={s.card}>
      <Text style={s.heading}>Firebase connection test</Text>
      <Text style={s.status}>{status}</Text>
      {!uid && <ActivityIndicator color="#9CC7FF" />}
      <Text style={s.label}>Podcast language</Text>
      <View style={s.wrap}>{LANGUAGES.map(x => <Pressable key={x} onPress={() => setLanguage(x)} style={[s.chip, language===x && s.selected]}><Text style={s.chipText}>{x}</Text></Pressable>)}</View>
      <Text style={s.label}>Narrator</Text>
      <View style={s.wrap}>{["Maya · Female", "Noah · Male"].map(x => <Pressable key={x} onPress={() => setVoice(x)} style={[s.chip, voice===x && s.selected]}><Text style={s.chipText}>{x}</Text></Pressable>)}</View>
      <View style={s.row}><Text style={s.label}>Daily reminder preference</Text><Switch value={reminder} onValueChange={setReminder}/></View>
      <Text style={s.small}>Your anonymous user ID: {uid ? uid.slice(0, 12) + "…" : "Signing in…"}</Text>
    </View>
  </SafeAreaView>;
}
const s=StyleSheet.create({
 page:{flex:1,backgroundColor:"#081321",padding:24,paddingTop:60},
 brand:{color:"#F4F7FC",fontSize:28,fontWeight:"900",letterSpacing:4},
 tag:{color:"#8FA7C5",fontSize:10,letterSpacing:3,marginTop:5,marginBottom:30},
 card:{backgroundColor:"#13243A",borderRadius:22,padding:20},
 heading:{color:"#F4F7FC",fontSize:20,fontWeight:"700",marginBottom:10},
 status:{color:"#9CC7FF",marginBottom:18},
 label:{color:"#EAF1FB",fontWeight:"600",marginTop:16,marginBottom:10},
 wrap:{flexDirection:"row",flexWrap:"wrap",gap:8},
 chip:{borderWidth:1,borderColor:"#40536D",paddingVertical:9,paddingHorizontal:12,borderRadius:18},
 selected:{backgroundColor:"#315C91",borderColor:"#9CC7FF"},
 chipText:{color:"#F4F7FC"},
 row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 small:{color:"#8FA7C5",fontSize:11,marginTop:24}
});
