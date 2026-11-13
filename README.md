# SkyCast — Weather Companion

A free Expo / React Native weather companion with written weather briefings and no speech or audio features.

## Requirements

- Node.js 22 or newer
- Expo SDK 58
- React 19.3
- React Native 0.88

## Run locally

```bash
npm install
npx expo-doctor
npx expo start --tunnel ngrok
```

Open the generated URL in Expo Go.

## Features

- Open-Meteo city search and live conditions
- Seven-day forecast with daily high/low and precipitation chance
- Twelve-hour temperature and rain-probability outlook
- Written daily weather briefing with practical context
- Air-quality snapshot (US AQI, PM2.5 and PM10) where data is available
- UV index, sunrise and sunset
- Rain heads-up when forecast precipitation probability is high
- Favourite cities stored locally on the device
- Current-temperature comparison for saved cities
- OpenStreetMap link for the selected city
- Dark, mobile-first interface

## No audio or speech

SkyCast intentionally contains no audio player, text-to-speech, speech synthesis, narrator controls, audio recording, or audio-generation backend. The app does not require Firebase, Cloud Functions, a speech engine, API keys, or paid billing for its current features.

## Data and privacy

Weather and air-quality data are retrieved from Open-Meteo. Favourite city names are stored locally on the device using AsyncStorage. No account is required.

Forecasts and environmental readings are estimates, may be delayed, and can be unavailable for some locations. They should not be used as emergency alerts.
