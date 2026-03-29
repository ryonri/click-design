// ============================================================
// ClickDesign 認証ゲート
// ============================================================

(function () {
  'use strict';

  const SESSION_KEY  = 'cd_auth_session';    // localStorage に保存 → 永続認証
  const CUSTOM_HASH_KEY = 'cd_custom_hash'; // 変更後のパスワードハッシュを保存するキー

  // ----------------------------------------------------------
  // SHA-256 ハッシュ生成
  // ----------------------------------------------------------
  async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ----------------------------------------------------------
  // 現在有効なパスワードハッシュを取得
  // (localStorage に保存済みなら優先、なければ auth_config.js の値)
  // ----------------------------------------------------------
  function getActiveHash() {
    return localStorage.getItem(CUSTOM_HASH_KEY) || AUTH_CONFIG.passwordHash;
  }

  // ----------------------------------------------------------
  // アプリを表示
  // ----------------------------------------------------------
  function revealApp() {
    var overlay = document.getElementById('authOverlay');
    var app     = document.getElementById('appContainer');
    if (overlay) {
      overlay.style.transition = 'opacity 0.35s ease';
      overlay.style.opacity = '0';
      setTimeout(function () { overlay.style.display = 'none'; }, 350);
    }
    if (app) app.style.display = '';
  }

  // ----------------------------------------------------------
  // セッション確認
  // ----------------------------------------------------------
  function isAuthenticated() {
    return localStorage.getItem(SESSION_KEY) === 'granted';
  }

  // ----------------------------------------------------------
  // ログイン処理
  // ----------------------------------------------------------
  async function handleLogin() {
    var input   = document.getElementById('authPasswordInput');
    var errorEl = document.getElementById('authErrorMsg');
    var btn     = document.getElementById('authLoginBtn');

    errorEl.style.display = 'none';

    if (!input.value) {
      errorEl.textContent = 'パスワードを入力してください。';
      errorEl.style.display = 'block';
      input.focus();
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 認証中...';

    try {
      var hash = await hashPassword(input.value);
      if (hash === getActiveHash()) {
        localStorage.setItem(SESSION_KEY, 'granted');
        btn.innerHTML = '<i class="fas fa-check"></i> 認証成功';
        setTimeout(revealApp, 300);
      } else {
        errorEl.textContent = 'パスワードが正しくありません。';
        errorEl.style.display = 'block';
        input.value = '';
        input.focus();
        input.classList.remove('auth-shake');
        void input.offsetWidth;
        input.classList.add('auth-shake');
        btn.disabled = false;
        btn.innerHTML = 'ログイン';
      }
    } catch (e) {
      errorEl.textContent = '認証処理でエラーが発生しました。';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = 'ログイン';
    }
  }

  // ----------------------------------------------------------
  // パスワード変更モーダルを開く (ログイン後に呼ばれる)
  // ----------------------------------------------------------
  window.openChangePasswordModal = function () {
    var modal = document.getElementById('changePasswordModal');
    if (modal) {
      document.getElementById('cpCurrentPw').value = '';
      document.getElementById('cpNewPw').value = '';
      document.getElementById('cpConfirmPw').value = '';
      document.getElementById('cpErrorMsg').style.display = 'none';
      document.getElementById('cpSuccessMsg').style.display = 'none';
      modal.style.display = 'flex';
      setTimeout(function () { document.getElementById('cpCurrentPw').focus(); }, 100);
    }
  };

  window.closeChangePasswordModal = function () {
    var modal = document.getElementById('changePasswordModal');
    if (modal) modal.style.display = 'none';
  };

  // ----------------------------------------------------------
  // パスワード変更処理
  // ----------------------------------------------------------
  async function handleChangePassword() {
    var currentPw  = document.getElementById('cpCurrentPw').value;
    var newPw      = document.getElementById('cpNewPw').value;
    var confirmPw  = document.getElementById('cpConfirmPw').value;
    var errorEl    = document.getElementById('cpErrorMsg');
    var successEl  = document.getElementById('cpSuccessMsg');
    var btn        = document.getElementById('cpSaveBtn');

    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    // バリデーション
    if (!currentPw || !newPw || !confirmPw) {
      errorEl.textContent = 'すべての項目を入力してください。';
      errorEl.style.display = 'block';
      return;
    }
    if (newPw !== confirmPw) {
      errorEl.textContent = '新しいパスワードと確認用パスワードが一致しません。';
      errorEl.style.display = 'block';
      return;
    }
    if (newPw.length < 4) {
      errorEl.textContent = 'パスワードは4文字以上で設定してください。';
      errorEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';

    try {
      // 現在のパスワードを照合
      var currentHash = await hashPassword(currentPw);
      if (currentHash !== getActiveHash()) {
        errorEl.textContent = '現在のパスワードが正しくありません。';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = '変更を保存';
        return;
      }

      // 新しいパスワードをハッシュ化して保存
      var newHash = await hashPassword(newPw);
      localStorage.setItem(CUSTOM_HASH_KEY, newHash);

      successEl.textContent = 'パスワードを変更しました！';
      successEl.style.display = 'block';
      btn.innerHTML = '<i class="fas fa-check"></i> 保存完了';

      // 入力欄をクリア
      document.getElementById('cpCurrentPw').value = '';
      document.getElementById('cpNewPw').value = '';
      document.getElementById('cpConfirmPw').value = '';

      setTimeout(window.closeChangePasswordModal, 1500);

    } catch (e) {
      errorEl.textContent = 'エラーが発生しました。もう一度お試しください。';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '変更を保存';
    }
  }

  // ----------------------------------------------------------
  // DOMContentLoaded
  // ----------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {

    // セッションが有効なら即座にアプリを表示
    if (isAuthenticated()) {
      revealApp();
    } else {
      // ログイン画面を表示
      var overlay = document.getElementById('authOverlay');
      if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { overlay.style.opacity = '1'; });
        });
      }
    }

    // ===== ログインフォーム =====
    var loginBtn      = document.getElementById('authLoginBtn');
    var passwordInput = document.getElementById('authPasswordInput');
    var toggleBtn     = document.getElementById('authTogglePasswordBtn');

    if (loginBtn)      loginBtn.addEventListener('click', handleLogin);
    if (passwordInput) {
      passwordInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleLogin();
      });
      setTimeout(function () { passwordInput.focus(); }, 150);
    }
    if (toggleBtn && passwordInput) {
      toggleBtn.addEventListener('click', function () {
        if (passwordInput.type === 'password') {
          passwordInput.type = 'text';
          toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
          passwordInput.type = 'password';
          toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
        }
      });
    }

    // ===== パスワード変更モーダル =====
    var cpSaveBtn  = document.getElementById('cpSaveBtn');
    var cpCancelBtn = document.getElementById('cpCancelBtn');
    var cpCloseBtn  = document.getElementById('cpCloseBtn');

    if (cpSaveBtn)   cpSaveBtn.addEventListener('click', handleChangePassword);
    if (cpCancelBtn) cpCancelBtn.addEventListener('click', window.closeChangePasswordModal);
    if (cpCloseBtn)  cpCloseBtn.addEventListener('click', window.closeChangePasswordModal);

    // Enterキーで保存
    ['cpCurrentPw', 'cpNewPw', 'cpConfirmPw'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleChangePassword();
      });
    });

    // パスワード変更ボタン (サイドバー)
    var changePwBtn = document.getElementById('changePasswordBtn');
    if (changePwBtn) changePwBtn.addEventListener('click', window.openChangePasswordModal);
  });

})();
