import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBCBdCwQ5KFbO0GacQ_h_9hF4mPs0IzW60",
  authDomain: "weather-podcast-5cb7c.firebaseapp.com",
  projectId: "weather-podcast-5cb7c",
  storageBucket: "weather-podcast-5cb7c.firebasestorage.app",
  messagingSenderId: "909534854839",
  appId: "1:909534854839:web:6ee3dd2795cd6bca1e1732",
  measurementId: "G-TPBX25HF0V"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch {
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };
