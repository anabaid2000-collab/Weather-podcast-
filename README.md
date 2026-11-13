# SkyCast — Weather Podcast

Expo / React Native weather dashboard with free on-device spoken weather briefings.

## Project requirements

- Node.js 22 or newer
- Expo SDK 58
- React 19.3
- React Native 0.88

## Run the app

From the repository root:

```bash
npm install
npx expo-doctor
npx expo start --tunnel ngrok
```

Open the generated URL in Expo Go. If the tunnel does not connect, try a fresh terminal session and a different available port. Firebase CLI login and a paid Firebase plan are not required to run the weather dashboard or play spoken briefings.

## Included features

- Open-Meteo city search, current conditions, and five-day forecast
- Chattogram as the initial city
- Maya / Noah narrator choices (different pitch settings)
- On-device speech playback through `expo-speech`
- Optional per-user Firestore podcast history when Firebase anonymous authentication is available

## Free voice playback

The podcast is spoken by the text-to-speech voices installed on the user's phone. The app does not call Google Cloud Text-to-Speech or a Firebase Cloud Function to play the briefing. Voice availability and sound quality depend on the device's speech engine and installed language packs.

No Firebase Blaze upgrade, Google Cloud billing, API key, or service-account key is needed for this local voice feature. The weather forecast still needs an internet connection because it is fetched from Open-Meteo.

## Firebase project configuration

The repository retains its Firebase project configuration for optional Firestore history:

- Project ID: `weather-podcast-5cb7c`

Firestore rules should remain restricted to authenticated users' own `users/{uid}` documents and subcollections. Do not use public read/write rules. If Firebase history is unavailable, spoken playback should still work.

## Cloud Functions

The `functions/` directory contains the earlier optional Google Cloud Text-to-Speech backend. It is not used by the current free on-device playback flow and does not need to be deployed. Do not enable billing just for the current voice feature.

## Troubleshooting

- **No voice:** check the phone's text-to-speech settings and make sure an English voice is installed.
- **Voice sounds different on another phone:** available voices are supplied by the device, so quality and voice choices can vary.
- **Forecast unavailable:** check the internet connection and retry the city search.
- **Firebase history unavailable:** voice playback can still work; check anonymous authentication and the user's Firestore rules if history is needed.
