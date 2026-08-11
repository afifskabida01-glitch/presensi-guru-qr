// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC1Pp7GpFX3vZ4SVrZ2EFh0gBhi-p9foLU",
  authDomain: "qrpresensi-guru.firebaseapp.com",
  projectId: "qrpresensi-guru",
  storageBucket: "qrpresensi-guru.firebasestorage.app",
  messagingSenderId: "898150961322",
  appId: "1:898150961322:web:f3a734659f4b50c54400d3",
  measurementId: "G-PQWQLY9PC7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);