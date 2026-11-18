import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Speech from "expo-speech";

const codes={0:"clear skies",1:"mostly clear skies",2:"partly cloudy",3:"overcast",45:"fog",48:"fog",51:"light drizzle",53:"drizzle",55:"heavy drizzle",61:"light rain",63:"rain",65:"heavy rain",71:"light snow",73:"snow",75:"heavy snow",80:"rain showers",81:"rain showers",82:"heavy showers",95:"thunderstorms",96:"thunderstorms with hail",99:"thunderstorms with hail"};
const hosts=[{id:"calm",label:"Calm",rate:.93,pitch:1},{id:"fun",label:"Cheerful",rate:1.08,pitch:1.12},{id:"news",label:"News anchor",rate:1.02,pitch:1}];
const activities=[["commuting","Commuting"],["running","Running"],["farming","Farming"],["travelling","Travelling"]];
const clock=(v)=>{if(!v)return "later today";const h=Number(v.slice(11,13));return (h%12||12)+(v.slice(14,16)==="00"?"":":"+v.slice(14,16))+(h<12?" AM":" PM");};
const n=(v)=>Number.isFinite(v)?Math.round(v):"—";

export default function ForecastFM({place,forecast,air,unit}) {
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
  const humidity=n(current.relative_humidity_2m), uv=n(daily.uv_index_max?.[0]), cloud=n(current.cloud_cover);
  const pressure=n(current.pressure_msl), visibility=Number.isFinite(current.visibility)?(current.visibility/1000).toFixed(1):"—";
  const direction=Number.isFinite(current.wind_direction_10m)?Math.round(current.wind_direction_10m)+" degrees":"not available";
  const airLine=Number.isFinite(air?.aqi)?"The latest available US AQI estimate is "+Math.round(air.aqi)+", with PM2.5 at "+n(air.pm25)+" and PM10 at "+n(air.pm10)+" micrograms per cubic metre.":"A current air-quality reading is not available for this location.";
  const activityAdvice={commuting:Number(rain)>=50?"Allow extra time, watch for slippery surfaces and check traffic before leaving.":"Conditions look comparatively settled for commuting, but check live traffic.",running:Number(rain)>=50?"Consider an indoor alternative if showers arrive.":"Check the feels-like temperature, UV and air quality before exercising outdoors.",farming:Number(rain)>=50?"Review the timing of showers before outdoor field work.":"Use the local forecast and soil conditions when planning field work.",travelling:Number(rain)>=50?"Check the route for rain-related disruption and allow extra time.":"Check route updates and the forecast again before departure."}[activity];
  if(drill)return {title:"Storm rehearsal · simulation",text:"This is a simulated severe-weather practice episode for "+city+". It is not a live weather warning. For real hazards, follow official local alerts and emergency instructions.",confidence:100};
  const intro=hostId==="fun"?"Hello "+city+"! You're listening to Forecast FM, your friendly guide to the changing sky.":hostId==="news"?"This is Forecast FM. Here is the latest weather briefing for "+city+".":"Good day, "+city+". Settle in for your detailed Forecast FM update.";
  const hourlyLine=next>=0?"Looking ahead, the next hour in the available forecast with at least a 50 percent rain probability is around "+clock(times[next])+".":"No upcoming hour in the available forecast window currently reaches a 50 percent rain probability.";
  const tomorrow=daily.time?.[1]?"For tomorrow, the outlook is "+(codes[daily.weather_code?.[1]]||"variable conditions")+", with a high of "+convert(daily.temperature_2m_max?.[1])+" and a low of "+convert(daily.temperature_2m_min?.[1])+" degrees "+u+".":"Tomorrow's detailed outlook is not available.";
  const uvLine=uv==="—"?"The UV index is unavailable.":uv>=8?"The UV index may reach "+uv+", which is very high. Seek shade and use sun protection.":uv>=6?"The UV index may reach "+uv+". Sun protection is recommended around midday.":"The maximum UV index is around "+uv+".";
  const introWeather="At the latest update, the temperature is "+temp+" degrees "+u+", and it feels like "+convert(current.apparent_temperature)+" degrees. Conditions are "+condition+". Today's high is "+hi+" and the low is "+lo+" degrees "+u+".";
  const windLine="Wind is around "+wind+" kilometres per hour, coming from "+direction+". Relative humidity is "+humidity+" percent, cloud cover is "+cloud+" percent, and visibility is about "+visibility+" kilometres. Mean sea-level pressure is "+pressure+" hectopascals.";
  const rainLine="The maximum daily precipitation probability is "+rain+" percent, with "+n(current.precipitation)+" millimetres of precipitation at the current time step.";
  const outro=hostId==="fun"?"That's your weather check-in. Keep an eye on the sky and enjoy your day!":hostId==="news"?"That concludes this Forecast FM report. Conditions can change; stay tuned to official local warnings.":"That is your detailed outlook for now. Forecasts can change, so check again before important plans. Take care.";
  return {title:city+" · "+condition,text:intro+"\n\n"+introWeather+"\n\n"+rainLine+" "+hourlyLine+"\n\n"+windLine+"\n\n"+airLine+" "+uvLine+"\n\n"+tomorrow+"\n\nFor your plan — "+activity+": "+activityAdvice+"\n\n"+outro,confidence:70};
 },[hourly,current,daily,rain,activity,drill,city,hostId,condition,temp,u,wind,lo,hi,air]);
 const speak=(text)=>{if(!text)return;Speech.stop();const opts={rate:host.rate,pitch:host.pitch,onStart:()=>setSpeaking(true),onDone:()=>setSpeaking(false),onStopped:()=>setSpeaking(false),onError:()=>setSpeaking(false)};if(voiceId)opts.voice=voiceId;Speech.speak(text,opts);};
 const ask=()=>{
  const q=question.trim().toLowerCase();
  if(!q){setAnswer("Ask about current conditions, rain, storms, wind, humidity, air quality, UV, visibility, sunrise, sunset or the forecast.");return;}
  const todayRain=Number(rain), tomorrowRain=Number(daily.precipitation_probability_max?.[1]??0);
  const hourIndex=(hourly.time||[]).findIndex(t=>t>=(current.time||""));
  const nextRain=(hourly.precipitation_probability||[]).slice(Math.max(0,hourIndex),Math.max(0,hourIndex)+12);
  let result;
  if(/tomorrow|next day/.test(q)) result="Tomorrow in "+city+": "+(codes[daily.weather_code?.[1]]||"forecast unavailable")+", high "+convert(daily.temperature_2m_max?.[1])+"°"+u+", low "+convert(daily.temperature_2m_min?.[1])+"°"+u+", rain probability "+tomorrowRain+"%.";
  else if(/week|7 day|seven day|weekend/.test(q)) result=(daily.time||[]).slice(0,7).map((d,i)=>d+": "+(codes[daily.weather_code?.[i]]||"variable")+", "+convert(daily.temperature_2m_min?.[i])+"–"+convert(daily.temperature_2m_max?.[i])+"°"+u+", rain "+(daily.precipitation_probability_max?.[i]??"—")+"%.").join("\n");
  else if(/rain|shower|umbrella|precipitation/.test(q)) result="Rain outlook for "+city+": "+todayRain+"% maximum probability today. "+(nextRain.length?"The next 12 hourly probabilities are "+nextRain.join(", ")+" percent. ":"")+(todayRain>=60?"Rain is likely enough that carrying rain protection is sensible.":"Rain is not currently the dominant signal, but check again before leaving.");
  else if(/air quality|aqi|pollution|pm2|pm10/.test(q)) result=Number.isFinite(air?.aqi)?"The available US AQI estimate is "+Math.round(air.aqi)+", PM2.5 "+n(air.pm25)+" and PM10 "+n(air.pm10)+" µg/m³.":"Air-quality data is unavailable right now for this location.";
  else if(/uv|sunburn|sun protection/.test(q)) result="Today's maximum UV index is "+n(daily.uv_index_max?.[0])+". "+(Number(daily.uv_index_max?.[0])>=6?"Use sun protection and seek shade around midday.":"UV is currently forecast below the high range.");
  else if(/wind|gust/.test(q)) result="Current wind speed is "+wind+" km/h"+(Number.isFinite(current.wind_direction_10m)?", direction "+Math.round(current.wind_direction_10m)+"°":"")+".";
  else if(/humid|humidity|sticky/.test(q)) result="Relative humidity is "+n(current.relative_humidity_2m)+"%.";
  else if(/visibility|fog/.test(q)) result="Current visibility is "+(Number.isFinite(current.visibility)?(current.visibility/1000).toFixed(1)+" km":"unavailable")+". Current conditions: "+condition+".";
  else if(/sunrise|sunset|daylight|sun/.test(q)) result="Sunrise: "+(daily.sunrise?.[0]?clock(daily.sunrise[0]):"unavailable")+". Sunset: "+(daily.sunset?.[0]?clock(daily.sunset[0]):"unavailable")+". Maximum UV index: "+n(daily.uv_index_max?.[0])+".";
  else if(/pressure|barometric/.test(q)) result="Mean sea-level pressure is "+n(current.pressure_msl)+" hPa.";
  else if(/cloud|overcast/.test(q)) result="Cloud cover is currently "+n(current.cloud_cover)+"%.";
  else if(/cold|hot|temperature|feels like|wear|clothes|jacket/.test(q)) result="It is "+temp+"°"+u+" now, feels like "+convert(current.apparent_temperature)+"°"+u+". Today's range is "+lo+"° to "+hi+"°. Dress comfortably for the feels-like temperature.";
  else if(/storm|thunder|lightning|severe|alert|warning/.test(q)) result="The current forecast condition is "+condition+". SkyCast's forecast feed is not an official warning service. Check your national meteorological agency and follow official alerts.";
  else if(/commute|road|traffic|travel|drive/.test(q)) result="Weather at "+city+" is "+condition+", with "+todayRain+"% maximum rain probability and wind near "+wind+" km/h. This app does not have a live road-closure feed; check traffic and official local advisories.";
  else result="For "+city+", the latest snapshot is "+temp+"°"+u+" with "+condition+", feels like "+convert(current.apparent_temperature)+"°"+u+", wind "+wind+" km/h, humidity "+n(current.relative_humidity_2m)+"%, and today's rain probability "+todayRain+"%. Ask about tomorrow, the week, rain timing, wind, humidity, UV, air quality, visibility, clouds, pressure, sunrise or travel weather.";
  setAnswer(result);speak(result);
 };
 return <View style={s.wrap}>
  <View style={s.hero}><Text style={s.kicker}>THE DAILY WEATHER SHOW</Text><Text style={s.title}>Forecast FM</Text><Text style={s.subtitle}>Your forecast, with a voice of its own.</Text><View style={s.now}><View style={{flex:1}}><Text style={s.city}>{city}</Text><Text style={s.condition}>{condition}</Text></View><Text style={s.temp}>{temp}°{u}</Text></View><View style={s.metrics}><View><Text style={s.metricValue}>{lo}°–{hi}°</Text><Text style={s.metricLabel}>TODAY'S RANGE</Text></View><View><Text style={s.metricValue}>{wind} km/h</Text><Text style={s.metricLabel}>WIND</Text></View><View><Text style={s.metricValue}>{rain}%</Text><Text style={s.metricLabel}>RAIN CHANCE</Text></View></View></View>
  <Text style={s.heading}>Choose your presenter</Text><View style={s.chips}>{hosts.map(x=><Pressable key={x.id} onPress={()=>setHostId(x.id)} style={[s.chip,hostId===x.id&&s.active]}><Text style={[s.chipText,hostId===x.id&&s.activeText]}>{x.label}</Text></Pressable>)}</View>
  <Text style={s.heading}>What's your plan today?</Text><View style={s.chips}>{activities.map(([id,label])=><Pressable key={id} onPress={()=>setActivity(id)} style={[s.chip,activity===id&&s.active]}><Text style={[s.chipText,activity===id&&s.activeText]}>{label}</Text></Pressable>)}</View>
  <Text style={s.heading}>Narrator voice</Text>{voices.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.voiceRow}>{(voices.filter(v=>v.language?.toLowerCase().startsWith("en")).length?voices.filter(v=>v.language?.toLowerCase().startsWith("en")):voices).slice(0,8).map(v=><Pressable key={v.identifier} onPress={()=>setVoiceId(v.identifier)} style={[s.voice,voiceId===v.identifier&&s.voiceActive]}><Text style={s.chipText}>{v.name.slice(0,22)}</Text></Pressable>)}</ScrollView>:<Text style={s.hint}>Using your device's default speech voice. Available voices depend on your phone.</Text>}
  <View style={s.episode}><Text style={s.kicker}>{drill?"PRACTICE SIMULATION":"ON AIR · LIVE FORECAST DATA"}</Text><Text style={s.episodeTitle}>{episode.title}</Text><Text style={s.conf}>{episode.confidence}% confidence indicator</Text><Text style={s.script}>{episode.text}</Text><View style={s.meter}><View style={[s.fill,{width:episode.confidence+"%"}]}/></View><View style={s.actions}><Pressable onPress={()=>speak(episode.text)} style={s.play}><Text style={s.playText}>{speaking?"Play again":"▶  Play episode"}</Text></Pressable><Pressable onPress={()=>{Speech.stop();setSpeaking(false);}} style={s.stop}><Text style={s.stopText}>Stop</Text></Pressable></View></View>
  <View style={s.askCard}><Text style={s.heading}>Ask the forecast</Text><TextInput value={question} onChangeText={setQuestion} onSubmitEditing={ask} returnKeyType="send" placeholder="Ask any weather question…" placeholderTextColor="#77878A" style={s.input}/><Pressable onPress={ask} style={s.ask}><Text style={s.playText}>Ask Forecast FM</Text></Pressable>{answer?<Text style={s.answer}>{answer}</Text>:null}</View>
  <Pressable onPress={()=>setDrill(v=>!v)} style={s.drill}><Text style={s.drillText}>{drill?"Return to live forecast":"Try a storm rehearsal (simulation)"}</Text></Pressable><Text style={s.disclaimer}>Live forecast and hourly data: Open-Meteo Forecast API. Air-quality estimates: Open-Meteo Air Quality API. Script uses the latest data loaded by SkyCast; update time: {current.time||"not available"}. Forecasts are estimates, not official warnings. Follow your national meteorological service for alerts.</Text>
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