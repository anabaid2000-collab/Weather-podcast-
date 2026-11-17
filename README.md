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
- Favourite cities synced to each anonymous user's private Firestore profile, with local device storage as a fallback
- Current-temperature comparison for saved cities
- OpenStreetMap link for the selected city
- Dark, mobile-first interface

## No audio or speech

SkyCast intentionally contains no audio player, text-to-speech, speech synthesis, narrator controls, audio recording, or audio-generation backend. Firebase Anonymous Authentication and Firestore sync saved city names to the signed-in user's private profile. Weather data remains powered by Open-Meteo; no Cloud Functions or speech backend are used.

## Data and privacy

Weather and air-quality data are retrieved from Open-Meteo. Favourite city names are cached locally with AsyncStorage and synced to `/users/{userId}` in Firestore after anonymous sign-in. Each user can read and write only their own profile. Weather and air-quality requests go to Open-Meteo.

Forecasts and environmental readings are estimates, may be delayed, and can be unavailable for some locations. They should not be used as emergency alerts.


## Firebase and Android push notifications

- Android Firebase configuration is stored in `google-services.json` and referenced by `expo.android.googleServicesFile`.
- Anonymous Authentication and per-user Firestore sync are initialized in `src/firebase.js`; users can access only their own `/users/{userId}` profile under the checked-in Firestore rules.
- In Firebase Console, enable **Authentication → Sign-in method → Anonymous** and create the Firestore database in the same project. Publish `firestore.rules` from this repository.
- In Expo/EAS project credentials, upload an **FCM V1 service-account key** for the Android application identifier. Do not put that service-account JSON in the repository.
- Install/build the app with the `preview` EAS build profile after adding native notifications. Remote push notifications require a new native Android build; an OTA update alone cannot add the native module.
- In SkyCast, open **More → Device notifications → Enable push notifications**. The app requests Android notification permission and saves the Expo push token to the signed-in user's Firestore profile.
- Sending actual remote messages still requires a trusted server or notification service. Never send FCM service-account credentials from the mobile app.
