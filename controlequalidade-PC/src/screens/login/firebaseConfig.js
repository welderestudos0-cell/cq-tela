// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCJPnGV_S2mc0W7XJDU2JO-rUcYZ0HJI3A",
  authDomain: "agrosolo-aa7c0.firebaseapp.com",
  projectId: "agrosolo-aa7c0",
  storageBucket: "agrosolo-aa7c0.firebasestorage.app",
  messagingSenderId: "985503264232",
  appId: "1:985503264232:web:6cdda1d444aac23ea7485d",
  measurementId: "G-ZSXJSRXJPE"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Sem persistência nativa (funciona no Expo Go)

export { app, auth };
