import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDthWX5cCB92yCRghDugBJUOljjylv5CoM",
  authDomain: "stock-game-fd402.firebaseapp.com",
  databaseURL: "https://stock-game-fd402-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "stock-game-fd402",
  storageBucket: "stock-game-fd402.firebasestorage.app",
  messagingSenderId: "877923629780",
  appId: "1:877923629780:web:e0f6b59902b9d2b9c19941"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
