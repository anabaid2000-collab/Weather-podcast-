// SkyCast Firebase setup
// Firebase client configuration is not a private key. Protect your data with
// Firebase Authentication and Firestore Security Rules.

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
