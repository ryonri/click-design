// Firebase 設定ファイル
// Firebaseコンソール「プロジェクトの設定 > マイアプリ」の値

const firebaseConfig = {
    apiKey: "AIzaSyDq_P7y2Jb9YaxpwXyJHOIilJpUg68XeKQ",
    authDomain: "clickdesign-login.firebaseapp.com",
    projectId: "clickdesign-login",
    storageBucket: "clickdesign-login.firebasestorage.app",
    messagingSenderId: "783060931087",
    appId: "1:783060931087:web:dad8faaecf05df5729897a",
    measurementId: "G-W7NC5VC1GM"
};

// Firebaseの初期化
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
} else {
    console.warn('Firebase SDKが読み込まれていません。');
}
