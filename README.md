# SkyCast — Weather Podcast

Expo / React Native starter connected to Firebase Authentication and Cloud Firestore.

## Runtime requirements

- Node.js 22.13 or newer
- Expo SDK 58
- React 19.3
- React Native 0.88

## Run locally

1. Install Node.js 22.13 or newer.
2. Run `npm install`.
3. Run `npx expo-doctor` to check the project.
4. Run `npx expo start --tunnel`.
5. Open the project with the matching Expo Go SDK or a development build.

## Included

- Anonymous Firebase sign-in
- Per-user Firestore preferences at `users/{uid}`
- Language, narrator, and daily-reminder preference controls
- Firebase client configuration in `src/firebase.js`

## Firebase setup

- Enable Anonymous sign-in in Firebase Authentication.
- Create a Cloud Firestore database.
- Publish rules that allow an authenticated user to read/write only `users/{their uid}`.

The current screen is a Firebase connection test. Weather data, forecast UI, real audio playback, and scheduled notifications are not implemented in this test build.

Never add service-account keys or private credentials to this repository.


## AI weather podcast setup

The app now includes a podcast player that turns the loaded weather conditions into a spoken English briefing. Audio is synthesized by Google Cloud Text-to-Speech using Neural2 voices (Maya and Noah).

Before the audio button can work in a deployed app:

1. In Google Cloud Console for Firebase project `weather-podcast-5cb7c`, enable the **Cloud Text-to-Speech API**.
2. Firebase Cloud Functions deployments require the Firebase **Blaze** billing plan. Review the current Firebase and Google Cloud pricing first, and configure budget alerts before enabling billing.
3. From the repository root, run `npm install` and `npm install --prefix functions`.
4. Deploy only the callable audio function with `npx firebase-tools deploy --only functions:generatePodcast` (or install/use the Firebase CLI and run `firebase deploy --only functions:generatePodcast`).
5. Reload the app. Sign-in is anonymous; the callable function rejects unauthenticated requests. The Google Cloud service account is used server-side; no API key is stored in the mobile app.

Audio is generated only after the user taps **Generate AI audio**. The current first version creates an English briefing; additional languages and longer-form AI-written podcast scripts are future enhancements.
