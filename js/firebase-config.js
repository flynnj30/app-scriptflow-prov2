// ================================================================
// FIREBASE CONFIGURATION
// ================================================================

// Replace with your Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyD_Ry0pM7EKSDJeTegt0rY5muiw-xCgrhw",
    authDomain: "scriptflow-pro-2cf4c.firebaseapp.com",
    projectId: "scriptflow-pro-2cf4c",
    storageBucket: "scriptflow-pro-2cf4c.firebasestorage.app",
    messagingSenderId: "250157640936",
    appId: "1:250157640936:web:cd6218470c302b305aed5d"
};

// Initialize Firebase with error handling
try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log('✅ Firebase initialized successfully');
        }
        
        // Enable offline persistence for better performance
        firebase.firestore().enablePersistence({ synchronizeTabs: true })
            .then(() => console.log('✅ Firebase persistence enabled'))
            .catch(err => {
                if (err.code === 'failed-precondition') {
                    console.warn('⚠️ Firebase persistence: multiple tabs open, persistence disabled');
                } else if (err.code === 'unimplemented') {
                    console.warn('⚠️ Firebase persistence not supported in this browser');
                } else {
                    console.warn('⚠️ Firebase persistence error:', err.message);
                }
            });
    } else {
        console.warn('⚠️ Firebase SDK not loaded');
    }
} catch (e) {
    console.warn('⚠️ Firebase initialization failed:', e.message);
}