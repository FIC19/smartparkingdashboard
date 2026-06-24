import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey:            'AIzaSyD-yTMZQajYheY96swu88RW8Hz8TcTSb0k',
  authDomain:        'iuiu-smart-parking.firebaseapp.com',
  databaseURL:       'https://iuiu-smart-parking-default-rtdb.firebaseio.com',
  projectId:         'iuiu-smart-parking',
  storageBucket:     'iuiu-smart-parking.firebasestorage.app',
  messagingSenderId: '1028051873998',
  appId:             '1:1028051873998:web:50d807c8dd9b707482609f',
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const rtdb = getDatabase(app);
