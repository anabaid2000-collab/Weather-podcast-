# SkyCast — Weather Podcast

Expo / React Native weather dashboard with a callable Firebase audio-generation backend.

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

Open the generated URL in Expo Go. If the tunnel does not connect, try a fresh terminal session and a different available port. The Firebase CLI login is not required just to run the weather dashboard.

## Included features

- Open-Meteo city search, current conditions, and five-day forecast
- Chattogram as the initial city
- Firebase anonymous authentication
- Per-user Firestore podcast history
- Maya / Noah narrator selection
- Callable Cloud Function named `generatePodcast`
- Google Cloud Text-to-Speech Neural2 audio generation
- Local MP3 caching and playback through `expo-audio`

The app's weather dashboard does not depend on Firebase. Podcast generation does.

## Firebase project configuration

The repository is configured to use the existing Firebase project:

- Project ID: `weather-podcast-5cb7c`
- Cloud Functions region: `us-central1`
- Callable function: `generatePodcast`

The `.firebaserc` file sets this project as the default, so Firebase CLI commands should be run from the repository root (the folder containing `firebase.json`).

To verify the selected project after Firebase CLI authentication:

```bash
npx firebase-tools projects:list
npx firebase-tools use
```

If the active project is not `weather-podcast-5cb7c`, run:

```bash
npx firebase-tools use default
```

## Enable AI audio (backend setup)

The AI voice feature cannot generate audio until the backend prerequisites are completed:

1. Enable **Cloud Text-to-Speech API** in Google Cloud Console for project `weather-podcast-5cb7c`.
2. Firebase Cloud Functions deployment requires the Blaze billing plan and may incur charges. A parent or guardian should review the current pricing, enable billing only if approved, and configure budget alerts.
3. Ensure the Cloud Functions runtime service account has permission to use Cloud Text-to-Speech (the `Cloud Text-to-Speech User` role).
4. From the repository root, install backend dependencies:

   ```bash
   npm install --prefix functions
   ```

5. After an authorized Firebase account is logged in and billing/API permissions are ready, deploy only the audio function:

   ```bash
   npx firebase-tools deploy --only functions:generatePodcast
   ```

6. Reload SkyCast and tap **Generate AI audio**.

The function uses its server-side Google Cloud identity. Never put service-account JSON, private keys, or access tokens in the app or GitHub repository. The client Firebase configuration in `src/firebase.js` is not a service-account key.

## Firestore security

Keep Firestore rules restricted to authenticated users' own `users/{uid}` documents and subcollections. Do not use public read/write rules.

## Troubleshooting

- **Firebase CLI says no active project:** check that the terminal is in the repository root and that `.firebaserc` and `firebase.json` are present.
- **Function not found:** `generatePodcast` has not been deployed to the configured project yet.
- **Permission denied / Text-to-Speech error:** check that the API is enabled and the function runtime service account has the required role.
- **No audio in the app:** check the message shown below the Generate AI audio button and confirm the callable function is deployed.

The first version creates an English weather briefing. Additional languages and longer-form AI-written scripts are future enhancements.
