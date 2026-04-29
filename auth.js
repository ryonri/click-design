// ============================================================
// ClickDesign 認証ゲート (Firebase Magic Link + Firestore ホワイトリスト)
// ============================================================

(function () {
  'use strict';

  const EMAIL_FOR_SIGN_IN = 'emailForSignIn';
  const RESEND_COOLDOWN_KEY = 'cd_lastSendAt';
  const RESEND_COOLDOWN_MS = 60 * 1000;

  function showOverlay() {
    var overlay = document.getElementById('authOverlay');
    var app = document.getElementById('appContainer');
    if (app) app.style.display = 'none';
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { overlay.style.opacity = '1'; });
      });
    }
  }

  function revealApp() {
    var overlay = document.getElementById('authOverlay');
    var app = document.getElementById('appContainer');
    if (overlay) {
      overlay.style.transition = 'opacity 0.35s ease';
      overlay.style.opacity = '0';
      setTimeout(function () { overlay.style.display = 'none'; }, 350);
    }
    if (app) app.style.display = '';
  }

  function showError(msg) {
    var errorEl = document.getElementById('authErrorMsg');
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function showInfo(msg) {
    var infoEl = document.getElementById('authInfoMsg');
    if (!infoEl) return;
    infoEl.textContent = msg;
    infoEl.style.display = 'block';
  }

  function hideMessages() {
    var errorEl = document.getElementById('authErrorMsg');
    var infoEl = document.getElementById('authInfoMsg');
    if (errorEl) errorEl.style.display = 'none';
    if (infoEl) infoEl.style.display = 'none';
  }

  function isValidEmailFormat(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Firestore の allowlist/{email} が存在するか確認
  async function isEmailRegistered(email) {
    const db = firebase.firestore();
    const docId = String(email).trim().toLowerCase();
    try {
      const snap = await db.collection('allowlist').doc(docId).get();
      return snap.exists;
    } catch (e) {
      console.error('allowlist 確認エラー:', e);
      return false;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (typeof firebase === 'undefined') {
      showError('認証システムの読み込みに失敗しました。ページを再読み込みしてください。');
      showOverlay();
      return;
    }
    if (typeof firebase.firestore !== 'function') {
      showError('認証システム（Firestore）の読み込みに失敗しました。');
      showOverlay();
      return;
    }

    const auth = firebase.auth();

    // 1. ログインリンクから戻ってきたときの処理
    if (auth.isSignInWithEmailLink(window.location.href)) {
      showOverlay();
      let email = window.localStorage.getItem(EMAIL_FOR_SIGN_IN);
      if (!email) {
        email = window.prompt('確認のため、ログインしたメールアドレスを再度入力してください：');
      }

      if (email) {
        auth.signInWithEmailLink(email, window.location.href)
          .then(async function () {
            window.localStorage.removeItem(EMAIL_FOR_SIGN_IN);
            window.history.replaceState({}, document.title, window.location.pathname);
            // サインイン成功後に Firestore で最終確認
            const ok = await isEmailRegistered(email);
            if (!ok) {
              await auth.signOut();
              showError('このメールアドレスは登録されていません。購入後に登録ページから登録してください。');
              showOverlay();
              return;
            }
            revealApp();
          })
          .catch(function (error) {
            console.error('ログインリンクエラー:', error);
            showError('リンクの有効期限が切れているか、無効です。再度ログインをお試しください。');
            window.history.replaceState({}, document.title, window.location.pathname);
            showOverlay();
          });
      } else {
        showOverlay();
      }
      return;
    }

    // 2. 認証状態の監視
    auth.onAuthStateChanged(async function (user) {
      if (!user) {
        showOverlay();
        return;
      }
      const ok = await isEmailRegistered(user.email);
      if (ok) {
        revealApp();
      } else {
        await auth.signOut();
        showError('このメールアドレスは登録されていません。購入後に登録ページから登録してください。');
        showOverlay();
      }
    });

    // 3. ログインリンク送信
    var loginBtn = document.getElementById('authLoginBtn');
    var emailInput = document.getElementById('authEmailInput');

    function setButtonLoading(isLoading) {
      if (!loginBtn) return;
      if (isLoading) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 送信中...';
      } else {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-envelope"></i> ログインリンクを送信';
      }
    }

    async function handleSendLink() {
      hideMessages();
      var email = (emailInput && emailInput.value || '').trim().toLowerCase();

      if (!email) {
        showError('メールアドレスを入力してください。');
        emailInput && emailInput.focus();
        return;
      }
      if (!isValidEmailFormat(email)) {
        showError('メールアドレスの形式が正しくありません。');
        return;
      }

      setButtonLoading(true);

      // 連続送信防止
      var lastSendAt = Number(window.localStorage.getItem(RESEND_COOLDOWN_KEY) || 0);
      var elapsed = Date.now() - lastSendAt;
      if (elapsed < RESEND_COOLDOWN_MS) {
        setButtonLoading(false);
        var wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        showError('再送信は ' + wait + ' 秒後に可能です。');
        return;
      }

      const actionCodeSettings = {
        url: window.location.href,
        handleCodeInApp: true,
      };

      try {
        await auth.sendSignInLinkToEmail(email, actionCodeSettings);
        window.localStorage.setItem(EMAIL_FOR_SIGN_IN, email);
        window.localStorage.setItem(RESEND_COOLDOWN_KEY, String(Date.now()));
        showInfo('ログイン用のリンクを ' + email + ' 宛に送信しました。メールをご確認ください。');
        if (emailInput) emailInput.value = '';
      } catch (error) {
        console.error('送信エラー:', error);
        if (error.code === 'auth/invalid-email') {
          showError('有効なメールアドレス形式ではありません。');
        } else if (error.code === 'auth/too-many-requests') {
          showError('一時的にアクセスが制限されています。しばらくしてからお試しください。');
        } else {
          showError('メールの送信に失敗しました [' + (error.code || 'unknown') + ']: ' + (error.message || ''));
        }
      } finally {
        setButtonLoading(false);
      }
    }

    if (loginBtn) loginBtn.addEventListener('click', handleSendLink);
    if (emailInput) {
      emailInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleSendLink();
      });
      setTimeout(function () { emailInput.focus(); }, 150);
    }

    // 4. ログアウト処理
    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (confirm('ログアウトしますか？')) {
          auth.signOut().then(function () { location.reload(); });
        }
      });
    }
  });
})();
