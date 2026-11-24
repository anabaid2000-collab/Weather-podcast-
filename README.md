# SkyCast

SkyCast is an Expo and React Native weather companion for Android, with a web preview target. It combines live forecast data with practical planning guidance, an audio weather briefing, and optional community observations.

## Current project stack

- Expo SDK 58
- React 19.3 and React Native 0.88
- JavaScript
- Open-Meteo Forecast and Air Quality APIs
- Firebase Authentication and Cloud Firestore
- Expo Speech, Expo Notifications, AsyncStorage and Expo Updates
- React Native Reanimated and Worklets

## Run locally

Requirements:
- Node.js 22.13 or newer
- npm
- A compatible Android device or emulator for native testing

Install dependencies and start Expo:

```bash
npm install
npx expo-doctor
npx expo start
```

Scan the QR code with Expo Go when the installed Expo Go version supports this project's SDK. For native notification or other native-module testing, use an EAS development or preview build rather than assuming Expo Go has every native capability.

Useful commands:

```bash
npm run android
npm run web
npm run export:web
```

## Main app capabilities

- City search and current weather conditions.
- Daily and hourly forecasts, including temperature and precipitation probability.
- Rain, air-quality, UV, sunrise and sunset information when data is available.
- Decision guidance such as whether rain protection may be useful and whether conditions look reasonable for laundry.
- Approximate activity-planning scores for running, cycling, beach visits, stargazing and gardening.
- Weather safety guidance with reminders to follow official local warnings.
- Forecast FM: a spoken weather briefing with presenter styles, available device voices and activity-focused context.
- Ask the Forecast: rule-based answers to supported weather questions, spoken through device text-to-speech.
- A clearly labelled storm-rehearsal simulation. It is not a live warning.
- Weather Intelligence tools, including community observations and a comparison of current weather snapshots for two cities.
- Saved cities and Celsius/Fahrenheit settings.
- Optional Android notification permission and Expo push-token registration.
- Firebase-backed user settings and community weather reports.

Some planning features are heuristic estimates based on forecast inputs. Route comparison checks weather at the selected cities; it does not provide live traffic, road closures, turn-by-turn routing or route-specific forecasts.

## Project structure

```text
.
├── App.js
├── app.json
├── eas.json
├── firestore.rules
├── google-services.json
├── package.json
├── public/
│   └── .nojekyll
└── src/
    ├── firebase.js
    ├── firebase.web.js
    ├── forecast-fm.js
    ├── intelligence-panel.js
    ├── notifications.js
    ├── notifications.web.js
    ├── theme.js
    ├── weather-intelligence.js
    └── weather-service.js
```

`App.js` currently coordinates the main screens and app state. Weather fetching/formatting, Forecast FM, intelligence panels, Firebase, notifications, and theme logic are split into supporting modules under `src/`. The app has not yet completed a file-based route migration.

## Weather data and limitations

- Weather forecasts and current conditions are retrieved from Open-Meteo.
- Air-quality estimates are retrieved from the Open-Meteo Air Quality API.
- Data availability and forecast detail vary by location and provider coverage.
- Activity scores and decision guidance are estimates, not guarantees.
- Forecast FM and Ask the Forecast generate briefings from the data already loaded by the app. They are not a live human broadcast or a general-purpose AI assistant.
- SkyCast is not an emergency alert service. Check your national meteorological service and follow official warnings.

## Firebase and community data

The native Firebase setup is in `src/firebase.js`; the web setup is in `src/firebase.web.js`. The checked-in Firestore rules currently allow signed-in users to read and write only their own `/users/{userId}` profile data. Community weather reports can be read publicly and created by signed-in users under field and value validation rules. Updates and deletes of community reports are denied by the current rules.

Community reports include the observation, city, optional country, rounded latitude and longitude, source label and server timestamp. Do not submit sensitive personal information in a community report.

Before deploying Firestore rules to a live Firebase project, review them against the rules currently deployed in that project and confirm the intended access model. A repository copy does not prove that the live project uses the same rules.

## Android builds and updates

The Android application identifier is `com.skycast.weatherpodcast`. The Expo project ID and update URL are configured in `app.json`.

EAS build profiles in `eas.json`:
- `preview`: internal Android APK build on the preview update channel.
- `production`: Android App Bundle build on the production update channel.

Build commands:

```bash
npx --yes eas-cli@latest build --platform android --profile preview
npx --yes eas-cli@latest build --platform android --profile production
```

A successful build does not mean the app has been installed or tested on a physical device. OTA updates cannot add native modules or replace a required new native build. Preserve the existing EAS project, package identifier and signing credentials when maintaining this app.

## Notifications

The Android app requests notification permission and registers an Expo push token. Token registration alone does not send weather alerts. Actual remote notifications require a trusted server or notification service; never place FCM service-account credentials in the mobile app or repository.

## Privacy, terms and release readiness

Review the app's actual Firebase and Open-Meteo data flows before publishing a Privacy Policy and Terms and Conditions. The repository documentation is not a substitute for those legal documents. Before a public launch, verify the policy pages, app icon, web favicon, custom domain, attribution, links, and behavior on supported devices and browsers.

## Development and release safety

- Work on the `skycast-vintage-weather-bureau` feature branch unless a different branch is explicitly approved.
- Do not merge into `main` without explicit approval.
- Do not commit service-account JSON, private signing keys, passwords or other secrets.
- Do not delete or regenerate existing signing credentials as part of routine maintenance.
- Review Firestore rules and EAS configuration before changing live services.
