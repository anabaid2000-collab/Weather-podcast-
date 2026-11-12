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
