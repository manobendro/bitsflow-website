/**
 * Firebase web SDK initialization for browser-side React islands.
 *
 * This module is import-safe on the server (it only *creates* the app object),
 * but the auth/firestore singletons should be used inside client components
 * (those with a `client:*` directive) so they run in the browser.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const useEmulators = import.meta.env.PUBLIC_USE_EMULATORS === 'true';

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let _emulatorsConnected = false;

export function app(): FirebaseApp {
  if (_app) return _app;
  _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

export function auth(): Auth {
  if (!_auth) {
    _auth = getAuth(app());
    if (useEmulators && !_emulatorsConnected) connectEmulators();
  }
  return _auth;
}

export function db(): Firestore {
  if (!_db) {
    _db = getFirestore(app());
    if (useEmulators && !_emulatorsConnected) connectEmulators();
  }
  return _db;
}

export function storage(): FirebaseStorage {
  if (!_storage) {
    _storage = getStorage(app());
    if (useEmulators && !_emulatorsConnected) connectEmulators();
  }
  return _storage;
}

function connectEmulators() {
  if (_emulatorsConnected || typeof window === 'undefined') return;
  _emulatorsConnected = true;
  try {
    connectAuthEmulator(getAuth(app()), 'http://127.0.0.1:9099', {
      disableWarnings: true,
    });
    connectFirestoreEmulator(getFirestore(app()), '127.0.0.1', 9080);
    connectStorageEmulator(getStorage(app()), '127.0.0.1', 9199);
    // eslint-disable-next-line no-console
    console.info('[firebase] connected to local emulators');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[firebase] failed to connect emulators', err);
  }
}
