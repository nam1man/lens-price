import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDJXUJlrh6np3TU07Afz2XbKhQkOi8WAZc',
  authDomain: 'lens-price.firebaseapp.com',
  projectId: 'lens-price',
  storageBucket: 'lens-price.firebasestorage.app',
  messagingSenderId: '901746958467',
  appId: '1:901746958467:web:63cb39e8829f99c6b7bbb6',
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
