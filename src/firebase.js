// SkyCast Firebase client setup. Never place service-account credentials in this app.
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { initializeAuth, getAuth, getReactNativePersistence, signInAnonymously } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyBCBdCwQ5KFbO0GacQ_h_9hF4mPs0IzW60",
  authDomain: "weather-podcast-5cb7c.firebaseapp.com",
  projectId: "weather-podcast-5cb7c",
  storageBucket: "weather-podcast-5cb7c.firebasestorage.app",
  messagingSenderId: "909534854839",
  appId: "1:909534854839:web:6ee3dd2795cd6bca1e1732",
  measurementId: "G-TPBX25HF0V",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
let authInstance;
try {
  authInstance = initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });
} catch {
  authInstance = getAuth(firebaseApp);
}
export const auth = authInstance;
