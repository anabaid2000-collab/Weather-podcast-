// Open-Meteo weather data access and display-formatting helpers.
// Keep network/data logic outside the root app component.
const weatherCodes = {
  0:["Clear sky","○"],1:["Mainly clear","◐"],2:["Partly cloudy","◑"],3:["Overcast","≋"],
  45:["Fog","≋"],48:["Rime fog","≋"],51:["Light drizzle","╱"],53:["Drizzle","╱"],55:["Heavy drizzle","╱"],
  56:["Freezing drizzle","╱"],57:["Freezing drizzle","╱"],61:["Light rain","╱"],63:["Rain","╱"],65:["Heavy rain","╱"],
  66:["Freezing rain","╱"],67:["Heavy freezing rain","╱"],71:["Light snow","*"],73:["Snow","*"],75:["Heavy snow","*"],
  77:["Snow grains","*"],80:["Rain showers","╱"],81:["Rain showers","╱"],82:["Heavy showers","ϟ"],
  85:["Snow showers","*"],86:["Heavy snow showers","*"],95:["Thunderstorm","ϟ"],96:["Thunderstorm with hail","ϟ"],99:["Severe thunderstorm","ϟ"]
};
export const describe = (code) => weatherCodes[code] || ["Changing conditions","°"];
export const dayLabel = (date, index) => index === 0 ? "Today" : new Date(date + "T12:00:00").toLocaleDateString(undefined,{weekday:"short"});
export const number = (value, suffix="") => Number.isFinite(value) ? Math.round(value) + suffix : "-";
export const clockLabel = (value) => value?.split("T")?.[1]?.slice(0,5) || "-";

export async function getCity(name) {
  const response = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(name) + "&count=1&language=en&format=json");
  if (!response.ok) throw new Error("City search is temporarily unavailable.");
  const city = (await response.json()).results?.[0];
  if (!city) throw new Error("City not found. Check the spelling and try again.");
  return city;
}
export async function getWeather(city) {
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
