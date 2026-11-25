const finite = (value) => Number.isFinite(Number(value));
const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));

export function getWeatherDecisions(forecast) {
  const current = forecast?.current || {};
  const daily = forecast?.daily || {};
  const hourly = forecast?.hourly || {};
  const times = forecast?.minutely_15?.time || [];
  const rain = forecast?.minutely_15?.precipitation || [];
  const now = current.time || "";
  const minuteIndex = times.findIndex((time) => time >= now);
  const nextRainIndex = minuteIndex < 0 ? -1 : times.findIndex((time, index) => index >= minuteIndex && Number(rain[index]) >= 0.1);
  const hourlyTimes = hourly.time || [];
  const hourlyRain = hourly.precipitation_probability || [];
  const hourIndex = hourlyTimes.findIndex((time) => time >= now);
  const nextEight = hourlyRain.slice(Math.max(0, hourIndex), Math.max(0, hourIndex) + 8).map(Number);
  const maxEight = nextEight.length ? Math.max(...nextEight.filter(Number.isFinite), 0) : null;
  const dailyChance = Number(daily.precipitation_probability_max?.[0] ?? 0);
  const hasMinuteData = minuteIndex >= 0 && rain.length > 0;
  const startsAt = nextRainIndex >= 0 ? times[nextRainIndex] : null;
  const currentRain = Number(current.precipitation || 0) >= 0.1;
  const umbrella = currentRain || (maxEight !== null && maxEight >= 45) || dailyChance >= 60;
  const laundry = !currentRain && (maxEight === null || maxEight < 25) && Number(current.wind_speed_10m || 0) < 30;
  return {
    umbrella: { answer: umbrella ? "Take an umbrella" : "An umbrella may not be needed", detail: currentRain ? "Precipitation is reported in the current weather step." : maxEight !== null ? "Highest rain probability in the next 8 forecast hours: " + Math.round(maxEight) + "%." : "Today's rain probability: " + Math.round(dailyChance) + "%.", confidence: "Forecast guidance, not a guarantee." },
    laundry: { answer: laundry ? "Laundry conditions look reasonable" : "Consider waiting before hanging laundry", detail: currentRain ? "Rain is currently reported." : maxEight !== null ? "Next 8 hours: up to " + Math.round(maxEight) + "% rain probability; wind " + Math.round(Number(current.wind_speed_10m || 0)) + " km/h." : "Not enough hourly data to assess the next 8 hours.", confidence: "Check the sky and local conditions before leaving laundry unattended." },
    rainTiming: { hasMinuteData, startsAt, currentRain, detail: startsAt ? "The 15-minute interval forecast first shows precipitation at " + startsAt.replace("T", " ") + ". Interval values may be interpolated from hourly forecasts depending on region." : hasMinuteData ? "No precipitation threshold is reached in the available 15-minute forecast window." : "Minute-level precipitation data is unavailable for this location. Hourly probabilities are shown instead." }
  };
}

export function getActivityScores(forecast) {
  const current = forecast?.current || {};
  const hourly = forecast?.hourly || {};
  const now = current.time || "";
  const start = Math.max(0, (hourly.time || []).findIndex((time) => time >= now));
  const take = (key) => (hourly[key] || []).slice(start, start + 6).map(Number).filter(Number.isFinite);
  const avg = (values, fallback = 0) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
  const rain = avg(take("precipitation_probability"));
  const wind = avg(take("wind_speed_10m"), Number(current.wind_speed_10m || 0));
  const uv = avg(take("uv_index"), 0);
  const cloud = avg(take("cloud_cover"), Number(current.cloud_cover || 50));
  const temp = avg(take("temperature_2m"), Number(current.temperature_2m || 20));
  const visibility = avg(take("visibility"), Number(current.visibility || 10000)) / 1000;
  const weatherPenalty = rain * 0.45 + Math.max(0, wind - 15) * 1.4 + Math.max(0, uv - 6) * 3 + Math.max(0, 5 - visibility) * 3;
  const score = (base, penalty) => clamp(base - penalty);
  return [
    { id: "running", label: "Running", score: score(100, weatherPenalty + Math.max(0, Math.abs(temp - 18) - 8) * 2), reason: "Based on rain, wind, UV, visibility and temperature." },
    { id: "cycling", label: "Cycling", score: score(100, weatherPenalty + Math.max(0, wind - 20) * 1.2), reason: "Wind and visibility carry additional weight." },
    { id: "beach", label: "Beach", score: score(100, rain * 0.6 + Math.max(0, cloud - 45) * 0.65 + Math.max(0, 22 - temp) * 2 + Math.max(0, uv - 8) * 4), reason: "Considers rain, cloud cover, temperature and UV." },
    { id: "stargazing", label: "Stargazing", score: score(100, cloud * 0.9 + rain * 0.25 + wind * 0.3), reason: "Cloud cover is the strongest factor; local light pollution is not included." },
    { id: "gardening", label: "Gardening", score: score(100, rain * 0.45 + Math.max(0, wind - 20) * 1.2 + Math.max(0, uv - 7) * 3 + Math.max(0, Math.abs(temp - 21) - 10) * 2), reason: "Outdoor comfort estimate; soil moisture is not included." }
  ];
}

export function getSafetyGuidance(code) {
  if (code >= 95) return ["Move indoors to a substantial building when thunder is heard.", "Stay away from open fields, isolated trees and exposed high ground.", "Follow official local warnings and avoid flooded roads."];
  if (code >= 65 || (code >= 80 && code <= 82)) return ["Use shelter during heavy rain.", "Avoid walking or driving through floodwater.", "Check official local alerts and travel updates before leaving."];
  if (code === 45 || code === 48) return ["Slow down and increase following distance when travelling.", "Use appropriate visibility lights where required.", "Check local conditions before starting a journey."];
  return ["Check official weather warnings before outdoor plans.", "Keep essential contacts and a charged phone available.", "If conditions worsen, move to a safe sheltered place."];
}
