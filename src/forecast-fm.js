import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Speech from "expo-speech";

const codes={0:"clear skies",1:"mostly clear skies",2:"partly cloudy",3:"overcast",45:"fog",48:"fog",51:"light drizzle",53:"drizzle",55:"heavy drizzle",61:"light rain",63:"rain",65:"heavy rain",71:"light snow",73:"snow",75:"heavy snow",80:"rain showers",81:"rain showers",82:"heavy showers",95:"thunderstorms",96:"thunderstorms with hail",99:"thunderstorms with hail"};
const hosts=[{id:"calm",label:"Calm",rate:.93,pitch:1},{id:"fun",label:"Cheerful",rate:1.08,pitch:1.12},{id:"news",label:"News anchor",rate:1.02,pitch:1}];
const activities=[["commuting","Commuting"],["running","Running"],["farming","Farming"],["travelling","Travelling"]];
const clock=(v)=>{if(!v)return "later today";const h=Number(v.slice(11,13));return (h%12||12)+(v.slice(14,16)==="00"?"":":"+v.slice(14,16))+(h<12?" AM":" PM");};
const n=(v)=>Number.isFinite(v)?Math.round(v):"—";

export default function ForecastFM({place,forecast,unit}) {
 const current=forecast?.current||{}, daily=forecast?.daily||{}, hourly=forecast?.hourly||{};
 const [hostId,setHostId]=useState("calm"),[activity,setActivity]=useState("commuting");
 const [voices,setVoices]=useState([]),[voiceId,setVoiceId]=useState("");
 const [question,setQuestion]=useState(""),[answer,setAnswer]=useState(""),[drill,setDrill]=useState(false),[speaking,setSpeaking]=useState(false);
 const city=place?.name||"your city", u=unit||"C", convert=(v)=>u==="F"&&Number.isFinite(v)?Math.round(v*9/5+32):n(v), temp=convert(current.temperature_2m), hi=convert(daily.temperature_2m_max?.[0]), lo=convert(daily.temperature_2m_min?.[0]), wind=n(current.wind_speed_10m), rain=n(daily.precipitation_probability_max?.[0]), condition=codes[current.weather_code]||"changing conditions";
 const host=hosts.find(x=>x.id===hostId)||hosts[0];
 useEffect(()=>{let active=true;Speech.getAvailableVoicesAsync().then(v=>{if(active){setVoices(v||[]);const preferred=(v||[]).find(x=>x.language?.toLowerCase().startsWith("en"));if(preferred)setVoiceId(preferred.identifier);}}).catch(()=>{});return()=>{active=false;Speech.stop();};},[]);
 const episode=useMemo(()=>{
  const times=hourly.time||[], probs=hourly.precipitation_probability||[], now=current.time||"";
  const next=times.findIndex((t,i)=>t>=now&&Number(probs[i])>=50);
  const activityAdvice={commuting:Number(rain)>=50?"Allow extra time and keep an umbrella handy.":"Conditions look fairly settled for your commute.",running:Number(rain)>=50?"Consider moving your run indoors if showers arrive.":"Check the temperature before heading out and bring water.",farming:Number(rain)>=50?"Check shower timing before planning outdoor field work.":"Review soil moisture and local conditions before field work.",travelling:Number(rain)>=50?"Check travel updates and pack a rain layer.":"Check your route and the latest forecast before leaving."}[activity];
  if(drill)return {title:"Storm rehearsal · simulation",text:"This is a simulated severe-weather practice episode for "+city+". It is not a live weather warning. In a real severe-weather situation, follow official local alerts and instructions.",confidence:100};
  const intro=hostId==="fun"?"Hello "+city+"! Welcome to Forecast FM, your little update from the sky.":hostId==="news"?"This is Forecast FM with the latest weather outlook for "+city+".":"Good day, "+city+". Here is your latest weather briefing.";
  const rainLine=next>=0?"A rain probability of "+rain+" percent is forecast today, with the next higher-probability hour around "+clock(times[next])+".":"The daily maximum rain probability is "+rain+" percent.";
  const outro=hostId==="fun"?"That's your sky report. Have a lovely day!":hostId==="news"?"That concludes this Forecast FM update. Stay informed.":"That is the outlook for now. Take care.";
  return {title:city+" · "+condition,text:intro+"\n\nRight now it is "+temp+" degrees "+u+" with "+condition+". Winds are around "+wind+" kilometres per hour. Today's temperature range is "+lo+" to "+hi+" degrees "+u+".\n\n"+rainLine+"\n\nSince you're "+activity+": "+activityAdvice+"\n\n"+outro,confidence:Number(rain)>=70||Number(rain)<=10?85:Number(rain)>=40?60:72};
 },[hourly,current.time,rain,activity,drill,city,hostId,condition,temp,u,wind,lo,hi]);
 const speak=(text)=>{if(!text)return;Speech.stop();const opts={rate:host.rate,pitch:host.pitch,onStart:()=>setSpeaking(true),onDone:()=>setSpeaking(false),onStopped:()=>setSpeaking(false),onError:()=>setSpeaking(false)};if(voiceId)opts.voice=voiceId;Speech.speak(text,opts);};
 const ask=()=>{const q=question.trim().toLowerCase();if(!q){setAnswer("Type a question about rain, temperature, wind or clothing.");return;}let result="I can answer questions about rain, an umbrella, temperature, wind or what to wear.";if(/rain|umbrella/.test(q))result=Number(rain)>=50?"Rain is possible today, with a maximum forecast probability of "+rain+" percent. Carrying an umbrella may be useful.":"The maximum forecast rain probability is "+rain+" percent. Rain looks less likely, but forecasts can change.";else if(/wind/.test(q))result="Current wind speed is around "+wind+" kilometres per hour.";else if(/temp|hot|warm|cold|jacket|wear|clothes/.test(q))result="It is currently "+temp+"°"+u+", with a high of "+hi+"° and low of "+lo+"°. Choose clothing that feels comfortable for those conditions.";setAnswer(result);speak(result);};
 return <View style={s.wrap}>
  <View style={s.hero}><Text style={s.kicker}>THE DAILY WEATHER SHOW</Text><Text style={s.title}>Forecast FM</Text><Text style={s.subtitle}>Your forecast, with a voice of its own.</Text><View style={s.now}><View style={{flex:1}}><Text style={s.city}>{city}</Text><Text style={s.condition}>{condition}</Text></View><Text style={s.temp}>{temp}°{u}</Text></View><View style={s.metrics}><View><Text style={s.metricValue}>{lo}°–{hi}°</Text><Text style={s.metricLabel}>TODAY'S RANGE</Text></View><View><Text style={s.metricValue}>{wind} km/h</Text><Text style={s.metricLabel}>WIND</Text></View><View><Text style={s.metricValue}>{rain}%</Text><Text style={s.metricLabel}>RAIN CHANCE</Text></View></View></View>
  <Text style={s.heading}>Choose your presenter</Text><View style={s.chips}>{hosts.map(x=><Pressable key={x.id} onPress={()=>setHostId(x.id)} style={[s.chip,hostId===x.id&&s.active]}><Text style={[s.chipText,hostId===x.id&&s.activeText]}>{x.label}</Text></Pressable>)}</View>
  <Text style={s.heading}>What's your plan today?</Text><View style={s.chips}>{activities.map(([id,label])=><Pressable key={id} onPress={()=>setActivity(id)} style={[s.chip,activity===id&&s.active]}><Text style={[s.chipText,activity===id&&s.activeText]}>{label}</Text></Pressable>)}</View>
  <Text style={s.heading}>Narrator voice</Text>{voices.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.voiceRow}>{(voices.filter(v=>v.language?.toLowerCase().startsWith("en")).length?voices.filter(v=>v.language?.toLowerCase().startsWith("en")):voices).slice(0,8).map(v=><Pressable key={v.identifier} onPress={()=>setVoiceId(v.identifier)} style={[s.voice,voiceId===v.identifier&&s.voiceActive]}><Text style={s.chipText}>{v.name.slice(0,22)}</Text></Pressable>)}</ScrollView>:<Text style={s.hint}>Using your device's default speech voice. Available voices depend on your phone.</Text>}
  <View style={s.episode}><Text style={s.kicker}>{drill?"PRACTICE SIMULATION":"ON AIR · LIVE FORECAST DATA"}</Text><Text style={s.episodeTitle}>{episode.title}</Text><Text style={s.conf}>{episode.confidence}% confidence indicator</Text><Text style={s.script}>{episode.text}</Text><View style={s.meter}><View style={[s.fill,{width:episode.confidence+"%"}]}/></View><View style={s.actions}><Pressable onPress={()=>speak(episode.text)} style={s.play}><Text style={s.playText}>{speaking?"Play again":"▶  Play episode"}</Text></Pressable><Pressable onPress={()=>{Speech.stop();setSpeaking(false);}} style={s.stop}><Text style={s.stopText}>Stop</Text></Pressable></View></View>
  <View style={s.askCard}><Text style={s.heading}>Ask the forecast</Text><TextInput value={question} onChangeText={setQuestion} onSubmitEditing={ask} returnKeyType="send" placeholder="Do I need an umbrella?" placeholderTextColor="#77878A" style={s.input}/><Pressable onPress={ask} style={s.ask}><Text style={s.playText}>Ask Forecast FM</Text></Pressable>{answer?<Text style={s.answer}>{answer}</Text>:null}</View>
  <Pressable onPress={()=>setDrill(v=>!v)} style={s.drill}><Text style={s.drillText}>{drill?"Return to live forecast":"Try a storm rehearsal (simulation)"}</Text></Pressable><Text style={s.disclaimer}>Weather data is an estimate, not an official warning. Follow your local weather service for urgent alerts.</Text>
 </View>;
}
const s=StyleSheet.create({
 wrap:{gap:15,paddingBottom:18},
 hero:{backgroundColor:"#183A5B",borderRadius:18,padding:19,gap:9,borderWidth:1,borderColor:"#B18A52"},
 kicker:{color:"#77BFEA",fontSize:9,fontWeight:"800",letterSpacing:1.7},
 title:{color:"#FFFFFF",fontSize:34,fontWeight:"700",fontFamily:"sans-serif"},
 subtitle:{color:"#DCEAF7",fontSize:12,lineHeight:18},
 now:{flexDirection:"row",alignItems:"center",marginTop:12},
 city:{color:"#FFFFFF",fontSize:20,fontWeight:"700",fontFamily:"serif"},
 condition:{color:"#71849A",fontSize:12,marginTop:3},
 temp:{color:"#77BFEA",fontSize:38,fontWeight:"800"},
 metrics:{flexDirection:"row",justifyContent:"space-between",borderTopWidth:1,borderTopColor:"rgba(251,247,238,.22)",paddingTop:13,marginTop:8},
 metricValue:{color:"#FFFFFF",fontSize:15,fontWeight:"800"},
 metricLabel:{color:"#71849A",fontSize:8,fontWeight:"800",letterSpacing:1,marginTop:4},
 heading:{color:"#183A5B",fontSize:15,fontWeight:"700",fontFamily:"serif",marginBottom:-7},
 chips:{flexDirection:"row",flexWrap:"wrap",gap:8},
 chip:{borderWidth:1,borderColor:"#D8E7F5",borderRadius:8,paddingHorizontal:13,paddingVertical:9,backgroundColor:"#FFFFFF"},
 active:{backgroundColor:"#287FC5",borderColor:"#287FC5"},
 chipText:{color:"#183A5B",fontSize:11,fontWeight:"700"},
 activeText:{color:"#FFFFFF"},
 voiceRow:{gap:8},
 voice:{borderWidth:1,borderColor:"#D8E7F5",borderRadius:8,paddingHorizontal:10,paddingVertical:9,backgroundColor:"#FFFFFF"},
 voiceActive:{borderColor:"#B18A52",backgroundColor:"#EAF3FC"},
 hint:{color:"#71849A",fontSize:11,lineHeight:17},
 episode:{backgroundColor:"#FFFFFF",borderRadius:16,padding:16,borderWidth:1,borderColor:"#D8E7F5",borderLeftWidth:5,borderLeftColor:"#287FC5",gap:9},
 episodeTitle:{color:"#183A5B",fontSize:19,fontWeight:"700",fontFamily:"serif"},
 conf:{color:"#71849A",fontSize:10},
 script:{color:"#344A54",fontSize:12,lineHeight:20},
 meter:{height:7,backgroundColor:"#E8F2FC",borderRadius:4,overflow:"hidden"},
 fill:{height:7,backgroundColor:"#B18A52"},
 actions:{flexDirection:"row",gap:9},
 play:{backgroundColor:"#287FC5",borderRadius:8,padding:12,flex:1,alignItems:"center"},
 playText:{color:"#FFF9EF",fontSize:11,fontWeight:"800"},
 stop:{borderWidth:1,borderColor:"#287FC5",borderRadius:8,padding:12,justifyContent:"center"},
 stopText:{color:"#287FC5",fontSize:11,fontWeight:"800"},
 askCard:{backgroundColor:"#E8F2FC",borderRadius:14,padding:15,gap:10,borderWidth:1,borderColor:"#D8E7F5"},
 input:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#D8E7F5",borderRadius:8,padding:12,color:"#183A5B",fontSize:12},
 ask:{backgroundColor:"#287FC5",borderRadius:8,padding:12,alignItems:"center"},
 answer:{color:"#183A5B",fontSize:12,lineHeight:19},
 drill:{borderWidth:1,borderColor:"#A97836",borderRadius:8,padding:12,alignItems:"center",backgroundColor:"#EAF3FC"},
 drillText:{color:"#805B2D",fontSize:11,fontWeight:"800"},
 disclaimer:{color:"#71849A",fontSize:9,lineHeight:15}
});;