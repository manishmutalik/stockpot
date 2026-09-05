import { initializeApp } from 'firebase/app';
import { 
  getAuth,
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();

export { 
  signInWithPopup, 
  signInWithCredential,
  GoogleAuthProvider,
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc,
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit 
};
