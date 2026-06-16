// Firebase init — shared by every page.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBrybls7PLSITilGciJBY6cqkWjRitrIZE",
  authDomain: "hr-tool-vicair.firebaseapp.com",
  projectId: "hr-tool-vicair",
  storageBucket: "hr-tool-vicair.firebasestorage.app",
  messagingSenderId: "171637881226",
  appId: "1:171637881226:web:e6e45d39426a5563f87073"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
