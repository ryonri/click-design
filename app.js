// v1.2.5
console.log('app.js v1.2.5 loaded');

// スタイル注入（CSSキャッシュ回避）
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.cancel-btn {',
    '  background: linear-gradient(135deg, #f39c12, #e67e22) !important;',
    '  border: none !important;',
    '  color: white !important;',
    '  width: 100% !important;',
    '  padding: 0.75rem !important;',
    '  border-radius: 8px !important;',
    '  font-weight: 600 !important;',
    '  font-size: 1rem !important;',
    '  cursor: pointer !important;',
    '  text-shadow: 0 1px 2px rgba(0,0,0,0.3) !important;',
    '  transition: opacity 0.2s !important;',
    '}',
    '.cancel-btn:hover { opacity: 0.9 !important; }',
    '.design-wrapper.generated-image {',
    '  position: relative !important;',
    '}',
    '.design-loading {',
    '  position: absolute !important;',
    '  inset: 0 !important;',
    '  display: flex !important;',
    '  flex-direction: column !important;',
    '  align-items: center !important;',
    '  justify-content: center !important;',
    '  background: rgba(255,255,255,0.95) !important;',
    '  border-radius: 8px !important;',
    '  z-index: 10 !important;',
    '  gap: 12px !important;',
    '}',
    '.design-loading-text {',
    '  color: #2980b9 !important;',
    '  font-size: 14px !important;',
    '  font-weight: 600 !important;',
    '}',
    '.design-spinner {',
    '  width: 40px !important;',
    '  height: 40px !important;',
    '  border: 3px solid rgba(52,152,219,0.25) !important;',
    '  border-top-color: #3498db !important;',
    '  border-radius: 50% !important;',
    '  animation: clickdesign-spin 0.8s linear infinite !important;',
    '}',
    '@keyframes clickdesign-spin { to { transform: rotate(360deg); } }'
  ].join('\n');
  document.head.appendChild(style);
})();

// Web互換用ストレージAPIモック（インメモリーフォールバック付き）
const memoryStorage = {};

function isLocalStorageAvailable() {
  try {
    const testKey = '__test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

const useLocalStorage = isLocalStorageAvailable();

window.browserStorage = {
  get: async (key) => {
    if (typeof key === 'string') {
      try {
        const val = useLocalStorage ? localStorage.getItem(key) : memoryStorage[key];
        return { [key]: val ? JSON.parse(val) : undefined };
      } catch (e) {
        const val = useLocalStorage ? localStorage.getItem(key) : memoryStorage[key];
        return { [key]: val };
      }
    } else if (Array.isArray(key)) {
      const res = {};
      key.forEach(k => {
        try {
          const val = useLocalStorage ? localStorage.getItem(k) : memoryStorage[k];
          if (val) res[k] = JSON.parse(val);
        } catch (e) {
          const val = useLocalStorage ? localStorage.getItem(k) : memoryStorage[k];
          if (val) res[k] = val;
        }
      });
      return res;
    }
    return {};
  },
  set: async (items) => {
    // エラーは握りつぶさずthrowして呼び出し側に伝える
    Object.keys(items).forEach(key => {
      const stringified = JSON.stringify(items[key]);
      if (useLocalStorage) {
        localStorage.setItem(key, stringified);
      } else {
        memoryStorage[key] = stringified;
      }
    });
  },
  remove: async (key) => {
    try {
      if (typeof key === 'string') {
        if (useLocalStorage) localStorage.removeItem(key);
        else delete memoryStorage[key];
      } else if (Array.isArray(key)) {
        key.forEach(k => {
          if (useLocalStorage) localStorage.removeItem(k);
          else delete memoryStorage[k];
        });
      }
    } catch (e) {
      console.warn('Storage remove failed:', e);
    }
  },
  getBytesInUse: (param, callback) => {
    let total = 0;
    try {
      if (useLocalStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const val = localStorage.getItem(key);
          total += (key.length + (val ? val.length : 0)) * 2;
        }
      } else {
        for (const key in memoryStorage) {
          const val = memoryStorage[key];
          total += (key.length + (val ? val.length : 0)) * 2;
        }
      }
    } catch (e) {
      console.warn('Storage getBytesInUse failed:', e);
    }
    if (callback) callback(total);
    return total;
  }
};

// DOM要素
const titleInput = document.getElementById('designProjectTitle');
const pageContentTextarea = document.getElementById('pageContent');
const charCountSpan = document.getElementById('charCount');
const aspectRatioSelect = document.getElementById('aspectRatio');
const generateButtons = document.querySelectorAll('.generate-btn');
const apiSettingsBtn = document.getElementById('apiSettingsBtn');
const apiModal = document.getElementById('apiModal');
const apiKeyInput = document.getElementById('falExternalKeyConfig');
const saveApiBtn = document.getElementById('saveApiBtn');
const cancelApiBtn = document.getElementById('cancelApiBtn');
const closeModal = document.querySelector('.close');
const imageModal = document.getElementById('imageModal');
const modalImage = document.getElementById('modalImage');
const toastElement = document.getElementById('toast');

let currentPageContent = '';
let falApiKey = null;
let openaiApiKey = null;
let thumbGenApiKey = null; // サムネ生成管理ツール用 Claude API Key
let selectedProvider = 'fal'; // 'fal' | 'openai'
let generatedImages = {}; // スタイルごとの生成画像を保存
let designConfig = null; // デザイン設定
let designGroups = []; // デザイングループのリスト
let activeTab = 'home'; // 現在アクティブなタブ
let currentEditingGroupId = null; // 現在編集中のグループID
let tempDesigns = []; // 編集中のデザイン一時保存
let characterImageBase64 = null; // キャラクター画像のBase64データ
let designImageBase64 = null; // デザイン参考画像のBase64データ
let imageLibrary = []; // 画像ライブラリ
let currentLibraryTarget = null; // 'character' or 'design'

// トースト表示関数
function showToast(message, duration = 5000) {
  toastElement.textContent = message;
  toastElement.classList.add('show');

  setTimeout(() => {
    toastElement.classList.remove('show');
  }, duration);
}

// グローバルエラーハンドリング
window.onerror = function (message, source, lineno, colno, error) {
  console.error('Global Error:', message, error);
  if (typeof showToast === 'function') {
    showToast('エラー: ' + message);
  }
};

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('App initialization started');

  try {
    // デザイングループを読み込む
    await loadDesignGroups();

    // 画像ライブラリを初期化
    await initImageLibrary();

    // ストレージ使用量を表示
    await updateStorageUsage();

    // URLパラメータからページ内容を取得
    const urlParams = new URLSearchParams(window.location.search);
    const contentParam = urlParams.get('content');

    if (contentParam) {
      currentPageContent = decodeURIComponent(contentParam);
      pageContentTextarea.value = currentPageContent;
      updateCharCount();
    } else {
      const result = await window.browserStorage.get('pendingPageContent');
      if (result.pendingPageContent) {
        currentPageContent = result.pendingPageContent;
        pageContentTextarea.value = currentPageContent;
        updateCharCount();
        await window.browserStorage.remove('pendingPageContent');
      }
    }

    setupEventListeners();
    setupTabListeners();

    await loadApiKey();
    checkApiKeyWarning();
    setupSampleImageClickEvents();
    updateButtonStates();

    // Webアプリ版ではヘルプボタンを非表示にする
    const helpBtn = document.getElementById('helpDocsBtn');
    if (helpBtn) helpBtn.style.display = 'none';

    console.log('App initialization completed');
  } catch (error) {
    console.error('Initialization failed:', error);
    alert('初期化中にエラーが発生しました: ' + error.message);
  }
});

// Base64画像が最適化が必要かチェック（JPEGまたは500x500pxより大きい場合）
async function checkIfImageNeedsOptimization(base64Image) {
  return new Promise((resolve) => {
    // JPEGフォーマットかチェック
    if (base64Image.startsWith('data:image/jpeg') || base64Image.startsWith('data:image/jpg')) {
      resolve(true);
      return;
    }

    // 画像サイズをチェック
    const img = new Image();
    img.onload = () => {
      const needsResize = img.width > 500 || img.height > 500;
      resolve(needsResize);
    };
    img.onerror = () => resolve(false);
    img.src = base64Image;
  });
}

// Base64画像をWebP 500x500pxに最適化
async function optimizeBase64Image(base64Image) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // アスペクト比を保ったままリサイズ
      if (width > 500 || height > 500) {
        const ratio = Math.min(500 / width, 500 / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      // Canvasで描画
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // WebP形式でBase64に変換
      const optimizedBase64 = canvas.toDataURL('image/webp', 0.75);
      resolve(optimizedBase64);
    };

    img.onerror = () => reject(new Error('画像の最適化に失敗しました'));
    img.src = base64Image;
  });
}

// デザイングループを読み込む
async function loadDesignGroups() {
  try {
    const data = await window.browserStorage.get(['designGroups', 'customThumbCleanupDone']);

    // 固定(常設)のデフォルトグループを読み込む
    let permanentDefaults = await fetchPermanentDesignGroups();

    let savedGroups = [];
    let cleanupTriggered = false;
    if (data.designGroups && Array.isArray(data.designGroups) && data.designGroups.length > 0) {
      // 旧バージョンのデフォルトテンプレ(サムネテンプレ7種/8種)がストレージに残っていれば除外
      savedGroups = data.designGroups.filter(g =>
        g.name !== 'サムネテンプレ7種' && g.name !== 'サムネテンプレ8種'
      );

      // 「カスタムサムネテンプレート」という名前で残っているグループを一度だけクリーンアップ
      if (!data.customThumbCleanupDone) {
        const before = savedGroups.length;
        savedGroups = savedGroups.filter(g => g.name !== 'カスタムサムネテンプレート');
        if (savedGroups.length !== before) cleanupTriggered = true;
      }
    }

    // 常設グループ（先頭固定）＋ユーザー作成グループを結合
    designGroups = [...permanentDefaults, ...savedGroups];

    // クリーンアップ結果を保存し、次回以降は再実行しない
    if (!data.customThumbCleanupDone) {
      if (cleanupTriggered) {
        const groupsToSave = savedGroups.filter(g => !g.isPermanent);
        await window.browserStorage.set({ designGroups: groupsToSave, customThumbCleanupDone: true });
      } else {
        await window.browserStorage.set({ customThumbCleanupDone: true });
      }
    }
  } catch (error) {
    console.error('Failed to load design groups:', error);
    designGroups = [];
  }
  renderDesignGroups();
}

async function loadDefaultTemplates() {
  try {
    console.log('Loading default templates from base64 script...');
    if (typeof defaultTemplatesBase64 === 'undefined') {
      throw new Error('defaultTemplatesBase64 is not defined. Ensure default_templates.js is loaded.');
    }

    // Base64からバイナリ文字列に変換
    const binaryStr = atob(defaultTemplatesBase64);
    // バイナリ文字列からUint8Arrayに変換
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    
    // Uint8ArrayからBlobを作成
    const blob = new Blob([bytes], { type: 'application/zip' });
    
    const newGroup = await processZipFile(blob);
    if (newGroup) {
      // ZIP内のdesign.jsonが古い名前のままだった場合の補正
      if (newGroup.designs && newGroup.designs.length === 8 && newGroup.name === 'サムネテンプレ7種') {
        newGroup.name = 'サムネテンプレ8種';
      }
      
      designGroups.push(newGroup);
      await saveDesignGroups();
      console.log('Default templates loaded successfully from base64.');
    }
  } catch (error) {
    console.error('Error loading default templates:', error);
  }
}

// デザイングループを保存
async function saveDesignGroups() {
  try {
    // 常設グループはローカルストレージに保存しない
    const groupsToSave = designGroups.filter(g => !g.isPermanent);
    await window.browserStorage.set({ designGroups: groupsToSave });
    await updateStorageUsage(); // ストレージ使用量を更新
  } catch (err) {
    console.error('[saveDesignGroups] Failed to save:', err);
    const msg = (err && err.message) ? err.message : String(err);
    showToast('⚠️ 保存に失敗しました: ' + msg, 7000);
    throw err;
  }
}


// デザイングループをレンダリング
function renderDesignGroups() {
  const tabNav = document.getElementById('tabNav');
  const tabContent = document.getElementById('tabContent');
  const noDesignMessage = document.getElementById('noDesignMessage');

  // コンテナをクリア（ただしnoDesignMessageは残す）
  tabNav.innerHTML = '';
  // tabContentの中身をクリアするが、noDesignMessageは再利用または再作成が必要
  // ここではtab-paneクラスを持つ要素だけを削除
  const panes = tabContent.querySelectorAll('.tab-pane');
  panes.forEach(p => p.remove());

  if (designGroups.length === 0) {
    if (noDesignMessage) noDesignMessage.style.display = 'block';
    // アクティブタブをクリア
    activeTab = null;
    return;
  } else {
    if (noDesignMessage) noDesignMessage.style.display = 'none';
  }

  // デザイングループごとにタブを追加
  designGroups.forEach((group, index) => {
    // タブボタンを追加
    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn';
    tabBtn.dataset.tab = group.id;
    tabBtn.textContent = group.name;
    tabNav.appendChild(tabBtn);

    // タブコンテンツを追加
    const tabPane = document.createElement('div');
    tabPane.className = 'tab-pane';
    tabPane.id = `tab-${group.id}`;

    // スタイルグリッドを作成
    const styleGrid = document.createElement('div');
    styleGrid.className = 'style-grid';
    styleGrid.dataset.group = group.id;

    // グループのデザインを表示
    if (group.designs && group.designs.length > 0) {
      group.designs.forEach(design => {
        const styleItem = document.createElement('div');
        styleItem.className = 'style-item';
        const sampleImage = design.sampleImage && design.sampleImage !== null ? design.sampleImage : 'design/no_sample_image.jpg';
        const defaultAspectRatio = design.aspectRatio || '16:9';
        styleItem.innerHTML = `
          <div class="design-area">
            <div class="style-label">${design.name}</div>
            <div class="design-wrapper sample-image" style="aspect-ratio: ${defaultAspectRatio.replace(':', '/')};">
              <img src="${sampleImage}" alt="${design.name}サンプル">
            </div>
            <div class="aspect-ratio-selector">
              <label>アスペクト比:</label>
              <select class="aspect-ratio-select" data-style="${design.id}" data-group="${group.id}">
                <option value="5:2" ${defaultAspectRatio === '5:2' ? 'selected' : ''}>5:2</option>
                <option value="21:9" ${defaultAspectRatio === '21:9' ? 'selected' : ''}>21:9</option>
                <option value="16:9" ${defaultAspectRatio === '16:9' ? 'selected' : ''}>16:9</option>
                <option value="3:2" ${defaultAspectRatio === '3:2' ? 'selected' : ''}>3:2</option>
                <option value="4:3" ${defaultAspectRatio === '4:3' ? 'selected' : ''}>4:3</option>
                <option value="5:4" ${defaultAspectRatio === '5:4' ? 'selected' : ''}>5:4</option>
                <option value="1:1" ${defaultAspectRatio === '1:1' ? 'selected' : ''}>1:1</option>
                <option value="4:5" ${defaultAspectRatio === '4:5' ? 'selected' : ''}>4:5</option>
                <option value="3:4" ${defaultAspectRatio === '3:4' ? 'selected' : ''}>3:4</option>
                <option value="2:3" ${defaultAspectRatio === '2:3' ? 'selected' : ''}>2:3</option>
                <option value="9:16" ${defaultAspectRatio === '9:16' ? 'selected' : ''}>9:16</option>
              </select>
            </div>
            <button class="generate-btn" data-style="${design.id}" data-group="${group.id}">生成</button>
            <div class="design-display" id="design-${group.id}-${design.id}">
              <div class="design-wrapper generated-image" style="aspect-ratio: ${defaultAspectRatio.replace(':', '/')};">
                <img src="design/first_image.jpg" alt="生成中" style="width: 100%; height: 100%; object-fit: cover;">
              </div>
            </div>
            <div class="design-actions">
              <button class="action-btn download-btn" data-style="${design.id}" data-group="${group.id}" disabled>ダウンロード</button>
              <button class="action-btn copy-btn" data-style="${design.id}" data-group="${group.id}" disabled>コピー</button>
            </div>
          </div>
        `;
        styleGrid.appendChild(styleItem);
      });
    } else {
      styleGrid.innerHTML = '<p style="color:var(--text-dim); grid-column:1/-1; text-align:center;">デザインがありません。</p>';
    }

    // タブペインヘッダー（保存ボタン）は上部の「テンプレ保存」ボタンに統合したため廃止
    // const tabPaneHeader = document.createElement('div');
    // tabPaneHeader.className = 'tab-pane-header';
    // tabPaneHeader.innerHTML = `
    //   <button class="tab-save-btn" data-group-id="${group.id}" data-state="idle" title="このタブを保存">
    //     <span class="tab-save-icon">💾</span>
    //     <span class="tab-save-label">保存</span>
    //   </button>
    // `;
    // tabPane.appendChild(tabPaneHeader);

    tabPane.appendChild(styleGrid);
    tabContent.appendChild(tabPane);
  });

  // 現在のアクティブタブが存在するか確認し、なければ先頭を選択
  if (designGroups.length > 0) {
    const exists = designGroups.some(g => g.id === activeTab);
    if (!exists || activeTab === 'home') {
      switchTab(designGroups[0].id);
    } else {
      // 再描画後も同じタブをアクティブにする
      switchTab(activeTab);
    }
  }

  // タブイベントリスナーを再設定
  setupTabListeners();

  // イベントリスナーを再設定
  setupEventListeners();
  setupSampleImageClickEvents();
}

// タブ内の「保存」ボタンがクリックされたときの処理
async function handleTabSaveClick(btn) {
  const groupId = btn.dataset.groupId;
  const group = designGroups.find(g => g.id === groupId);
  if (!group) return;

  const iconEl = btn.querySelector('.tab-save-icon');
  const labelEl = btn.querySelector('.tab-save-label');

  btn.dataset.state = 'saving';
  btn.disabled = true;
  if (iconEl) iconEl.textContent = '⏳';
  if (labelEl) labelEl.textContent = '保存中...';

  try {
    await saveDesignGroups();
    btn.dataset.state = 'success';
    if (iconEl) iconEl.textContent = '✅';
    if (labelEl) labelEl.textContent = '保存済';
    showToast(`「${group.name}」を保存しました`);
    setTimeout(() => {
      if (document.body.contains(btn)) {
        btn.dataset.state = 'idle';
        btn.disabled = false;
        if (iconEl) iconEl.textContent = '💾';
        if (labelEl) labelEl.textContent = '保存';
      }
    }, 2000);
  } catch (err) {
    btn.dataset.state = 'error';
    btn.disabled = false;
    if (iconEl) iconEl.textContent = '⚠️';
    if (labelEl) labelEl.textContent = '再試行';
  }
}

// タブリスナーの設定（初回のみ）
let tabListenersSetup = false;

function setupTabListeners() {
  // タブボタン & 保存ボタンのクリックイベント（イベント委譲を使用）
  if (!tabListenersSetup) {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-btn')) {
        switchTab(e.target.dataset.tab);
        return;
      }
      const saveBtn = e.target.closest('.tab-save-btn');
      if (saveBtn) {
        handleTabSaveClick(saveBtn);
        return;
      }
    });
    tabListenersSetup = true;
  }

  // 以下のボタンは削除済みのためリスナー設定不要

  // デザイン編集モーダルの閉じるボタン
  const closeDesignEdit = document.querySelector('.close-design-edit');
  if (closeDesignEdit && !closeDesignEdit.hasAttribute('data-listener-set')) {
    closeDesignEdit.addEventListener('click', closeDesignEditModal);
    closeDesignEdit.setAttribute('data-listener-set', 'true');
  }

  // デザイン編集モーダルのキャンセルボタン
  const cancelDesignEditBtn = document.getElementById('cancelDesignEditBtn');
  if (cancelDesignEditBtn && !cancelDesignEditBtn.hasAttribute('data-listener-set')) {
    cancelDesignEditBtn.addEventListener('click', closeDesignEditModal);
    cancelDesignEditBtn.setAttribute('data-listener-set', 'true');
  }

  // デザイン編集モーダルの保存ボタン
  const saveDesignGroupBtn = document.getElementById('saveDesignGroupBtn');
  if (saveDesignGroupBtn && !saveDesignGroupBtn.hasAttribute('data-listener-set')) {
    saveDesignGroupBtn.addEventListener('click', saveDesignEdits);
    saveDesignGroupBtn.setAttribute('data-listener-set', 'true');
  }

  // デザイン追加ボタン
  const addDesignBtn = document.getElementById('addDesignBtn');
  if (addDesignBtn && !addDesignBtn.hasAttribute('data-listener-set')) {
    addDesignBtn.addEventListener('click', addDesignToEdit);
    addDesignBtn.setAttribute('data-listener-set', 'true');
  }
}

// タブを切り替える
function switchTab(tabId) {
  // すべてのタブボタンとコンテンツからactiveクラスを削除
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(btn => btn.classList.remove('active'));
  tabPanes.forEach(pane => pane.classList.remove('active'));

  // 選択されたタブにactiveクラスを追加
  const selectedBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const selectedPane = document.getElementById(`tab-${tabId}`);

  if (selectedBtn) selectedBtn.classList.add('active');
  if (selectedPane) selectedPane.classList.add('active');

  activeTab = tabId;

  // ボタンの有効/無効を更新
  updateButtonStates();
}

// ボタンの有効/無効を更新（ボタン削除済みのため空関数として維持）
function updateButtonStates() {
  // 操作ボタンは削除済み
}

// デザイングループを追加
async function addDesignGroup() {
  console.log('addDesignGroup clicked');
  const groupName = prompt('デザイングループ名を入力してください:');
  if (!groupName || groupName.trim() === '') {
    return;
  }

  // 新しいグループを作成
  const newGroup = {
    id: `group-${Date.now()}`,
    name: groupName.trim(),
    designs: []
  };

  designGroups.push(newGroup);
  try {
    await saveDesignGroups();
  } catch (e) {
    // 保存失敗時はロールバック（トーストはsaveDesignGroups側で表示）
    const idx = designGroups.findIndex(g => g.id === newGroup.id);
    if (idx !== -1) designGroups.splice(idx, 1);
    return;
  }
  renderDesignGroups();

  // 新しく作成したタブに切り替える
  switchTab(newGroup.id);
}

// デザイン編集モーダルを開く
function openDesignEditModal() {
  console.log('Opening edit modal for tab:', activeTab);

  // 現在アクティブなタブのグループを直接編集
  if (!activeTab || activeTab === 'home') {
    // ボタンが無効化されているはずだが、念のためチェック
    console.warn('Cannot edit home or null tab');
    return;
  }

  const modal = document.getElementById('designEditModal');

  // 現在のアクティブタブを読み込む
  loadGroupForEditing(activeTab);

  modal.classList.add('show');
}

// デザイン編集モーダルを閉じる
function closeDesignEditModal() {
  const modal = document.getElementById('designEditModal');
  modal.classList.remove('show');
  currentEditingGroupId = null;
  tempDesigns = [];
}

// 編集するグループを読み込む
function loadGroupForEditing(groupId) {
  if (!groupId) {
    return;
  }

  currentEditingGroupId = groupId;

  // グループを取得
  const group = designGroups.find(g => g.id === groupId);

  if (!group) return;

  // グループ名を入力フィールドに設定
  const groupNameInput = document.getElementById('groupNameInput');
  if (groupNameInput) {
    groupNameInput.value = group.name;
  }

  // デザインをコピー
  tempDesigns = JSON.parse(JSON.stringify(group.designs || []));

  // デザイン一覧を表示
  renderDesignsForEdit();
}

// 編集用デザイン一覧を表示
function renderDesignsForEdit() {
  const container = document.getElementById('designsContainer');
  const countSpan = document.getElementById('designCount');

  countSpan.textContent = tempDesigns.length;
  container.innerHTML = '';

  tempDesigns.forEach((design, index) => {
    const designItem = document.createElement('div');
    designItem.className = 'design-edit-item';

    // サンプル画像の表示用HTML
    const sampleImageHtml = design.sampleImage
      ? `<div class="design-image-upload has-image" data-index="${index}">
           <img src="${design.sampleImage}" alt="Sample">
           <div class="upload-overlay">
             <i class="fas fa-camera"></i>
             <span>変更する</span>
           </div>
         </div>`
      : `<div class="design-image-upload" data-index="${index}">
           <div class="upload-hint">
             <i class="fas fa-cloud-upload-alt fa-2x"></i>
             <span>画像をアップロード</span>
             <small>クリックまたはドラッグ＆ドロップ</small>
           </div>
         </div>`;

    designItem.innerHTML = `
      <div class="design-edit-header">
        <div class="design-header-left">
          <span class="design-number">#${index + 1}</span>
          <div class="design-reorder-buttons">
            <button class="move-left-btn" data-index="${index}" title="上へ移動" ${index === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
            <button class="move-right-btn" data-index="${index}" title="下へ移動" ${index === tempDesigns.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
          </div>
        </div>
        <button class="delete-design-btn" data-index="${index}"><i class="fas fa-trash-alt"></i> 削除</button>
      </div>
      
      <div class="design-edit-form">
        <div class="form-row">
          <div class="form-group">
            <label><i class="fas fa-fingerprint"></i> ID</label>
            <input type="text" class="design-id" value="${design.id || ''}" placeholder="例: modern_01" data-index="${index}">
          </div>
          <div class="form-group">
            <label><i class="fas fa-tag"></i> 名前</label>
            <input type="text" class="design-name" value="${design.name || ''}" placeholder="例: モダン風デザイン" data-index="${index}">
          </div>
        </div>

        <div class="form-row">
           <div class="form-group">
             <label><i class="fas fa-expand"></i> デフォルトアスペクト比</label>
             <select class="design-aspect-ratio" data-index="${index}">
               <option value="16:9" ${(design.aspectRatio || '16:9') === '16:9' ? 'selected' : ''}>16:9 (YouTubeサムネイル)</option>
               <option value="5:2" ${(design.aspectRatio || '16:9') === '5:2' ? 'selected' : ''}>5:2 (ワイドバナー)</option>
               <option value="21:9" ${(design.aspectRatio || '16:9') === '21:9' ? 'selected' : ''}>21:9 (ヘッダー)</option>
               <option value="1:1" ${(design.aspectRatio || '16:9') === '1:1' ? 'selected' : ''}>1:1 (Instagram)</option>
               <option value="9:16" ${(design.aspectRatio || '16:9') === '9:16' ? 'selected' : ''}>9:16 (ストーリー)</option>
               <option value="4:3" ${(design.aspectRatio || '16:9') === '4:3' ? 'selected' : ''}>4:3 (標準)</option>
               <option value="3:4" ${(design.aspectRatio || '16:9') === '3:4' ? 'selected' : ''}>3:4 (縦長)</option>
             </select>
           </div>
        </div>

        <div class="form-group">
          <label><i class="fas fa-image"></i> サンプル画像</label>
          ${sampleImageHtml}
          <input type="file" class="design-image-input" data-index="${index}" accept="image/*" style="display: none;">
        </div>

        <label class="checkbox-wrapper">
          <input type="checkbox" class="design-use-image-to-image" ${design.useImageToImage ? 'checked' : ''} data-index="${index}">
          <span class="checkbox-text">このサンプル画像を生成のベース(Image-to-Image)として使用する</span>
        </label>

        <div class="form-group">
          <label><i class="fas fa-magic"></i> プロンプト</label>
          <textarea class="design-prompt" rows="3" placeholder="画像生成用のプロンプトを入力..." data-index="${index}">${design.prompt || ''}</textarea>
        </div>
      </div>
    `;
    container.appendChild(designItem);

    // イベントリスナーを設定 (各アイテムごと)
    setupDesignEditListeners(designItem, index);
  });
}


// デザイン編集アイテムのイベントリスナーを設定
// デザイン編集アイテムのイベントリスナーを設定
function setupDesignEditListeners(item, index) {
  // 削除ボタン
  const deleteBtn = item.querySelector('.delete-design-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirm('このデザインを削除しますか？')) {
        tempDesigns.splice(index, 1);
        renderDesignsForEdit();
      }
    });
  }

  // 左に移動ボタン (上へ)
  const moveLeftBtn = item.querySelector('.move-left-btn');
  if (moveLeftBtn && !moveLeftBtn.disabled) {
    moveLeftBtn.addEventListener('click', () => {
      if (index > 0) {
        item.classList.add('moving');
        [tempDesigns[index - 1], tempDesigns[index]] = [tempDesigns[index], tempDesigns[index - 1]];
        setTimeout(() => renderDesignsForEdit(), 150);
      }
    });
  }

  // 右に移動ボタン (下へ)
  const moveRightBtn = item.querySelector('.move-right-btn');
  if (moveRightBtn && !moveRightBtn.disabled) {
    moveRightBtn.addEventListener('click', () => {
      if (index < tempDesigns.length - 1) {
        item.classList.add('moving');
        [tempDesigns[index], tempDesigns[index + 1]] = [tempDesigns[index + 1], tempDesigns[index]];
        setTimeout(() => renderDesignsForEdit(), 150);
      }
    });
  }

  // ID入力
  const idInput = item.querySelector('.design-id');
  if (idInput) {
    idInput.addEventListener('input', (e) => {
      tempDesigns[index].id = e.target.value;
    });
  }

  // 名前入力
  const nameInput = item.querySelector('.design-name');
  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      tempDesigns[index].name = e.target.value;
    });
  }

  // プロンプト入力
  const promptInput = item.querySelector('.design-prompt');
  if (promptInput) {
    promptInput.addEventListener('input', (e) => {
      tempDesigns[index].prompt = e.target.value;
    });
  }

  // アスペクト比入力
  const aspectRatioInput = item.querySelector('.design-aspect-ratio');
  if (aspectRatioInput) {
    aspectRatioInput.addEventListener('change', (e) => {
      tempDesigns[index].aspectRatio = e.target.value;
    });
  }

  // image-to-imageチェックボックス
  const useImageToImageCheckbox = item.querySelector('.design-use-image-to-image');
  if (useImageToImageCheckbox) {
    useImageToImageCheckbox.addEventListener('change', (e) => {
      tempDesigns[index].useImageToImage = e.target.checked;
    });
  }

  // 画像アップロード (.design-image-upload)
  const uploadArea = item.querySelector('.design-image-upload');
  const fileInput = item.querySelector('.design-image-input');

  if (uploadArea && fileInput) {
    uploadArea.addEventListener('click', () => {
      fileInput.click();
    });

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'var(--primary)';
      uploadArea.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.style.borderColor = '';
      uploadArea.style.backgroundColor = '';
    });

    uploadArea.addEventListener('drop', async (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '';
      uploadArea.style.backgroundColor = '';

      if (e.dataTransfer.files.length > 0) {
        handleImageUpload(e.dataTransfer.files[0], index);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleImageUpload(e.target.files[0], index);
      }
    });
  }
}

// 画像アップロード処理
async function handleImageUpload(file, index) {
  if (!file.type.startsWith('image/')) {
    alert('画像ファイルを選択してください');
    return;
  }

  try {
    // 画像をBase64に変換しつつ、最大サイズを制限 (1024x1024)
    const base64 = await resizeImageToBase64(file, 1024, 1024, 0.9);
    tempDesigns[index].sampleImage = base64;
    renderDesignsForEdit();
  } catch (error) {
    console.error('Image upload failed:', error);
    alert('画像のアップロードに失敗しました');
  }
}


// デザインを追加
function addDesignToEdit() {
  if (tempDesigns.length >= 32) {
    alert('デザインは最大32個までです');
    return;
  }

  const newDesign = {
    id: '',
    name: '',
    sampleImage: '',
    aspectRatio: '16:9',
    prompt: '',
    useImageToImage: false
  };

  tempDesigns.push(newDesign);
  renderDesignsForEdit();
}

// デザイン編集を保存
function saveDesignEdits() {
  if (!currentEditingGroupId) return;

  // グループ名のバリデーション
  const groupNameInput = document.getElementById('groupNameInput');
  const newGroupName = groupNameInput ? groupNameInput.value.trim() : '';

  if (!newGroupName) {
    alert('グループ名を入力してください');
    return;
  }

  // バリデーション
  for (let i = 0; i < tempDesigns.length; i++) {
    const design = tempDesigns[i];
    if (!design.id || !design.name || !design.prompt) {
      alert(`デザイン #${i + 1}: ID、名前、プロンプトは必須です`);
      return;
    }
  }

  // ID重複チェック
  const designIds = tempDesigns.map(d => d.id);
  const uniqueIds = new Set(designIds);
  if (uniqueIds.size !== designIds.length) {
    const duplicateIds = designIds.filter((id, idx) => designIds.indexOf(id) !== idx);
    const uniqueDuplicates = [...new Set(duplicateIds)];
    showToast(`IDが重複しています: ${uniqueDuplicates.join(', ')}\n各デザインのIDは一意である必要があります。`);
    return;
  }

  // グループを更新
  const group = designGroups.find(g => g.id === currentEditingGroupId);
  if (group) {
    group.name = newGroupName;
    group.designs = tempDesigns;
  }

  // 編集していたグループのIDを保存
  const editedGroupId = currentEditingGroupId;

  saveDesignGroups();
  renderDesignGroups();
  closeDesignEditModal();

  // 編集していたタブに切り替え
  switchTab(editedGroupId);

  showToast('デザインを保存しました');
}

// デザイングループを削除
async function deleteDesignGroup() {
  // 現在アクティブなタブのグループを削除
  if (activeTab === 'home') {
    alert('ホームは削除できません');
    return;
  }

  // 現在のグループを取得
  const group = designGroups.find(g => g.id === activeTab);
  if (!group) {
    alert('削除できるグループがありません');
    return;
  }

  // 常設グループは削除不可
  if (group.isPermanent) {
    alert('固定テンプレートグループは削除できません');
    return;
  }

  if (!confirm(`「${group.name}」を削除しますか？この操作は取り消せません。`)) {
    return;
  }

  // グループを削除
  const index = designGroups.findIndex(g => g.id === activeTab);
  if (index !== -1) {
    designGroups.splice(index, 1);
    saveDesignGroups();
    renderDesignGroups();

    // ホームタブに切り替え
    switchTab('home');

    showToast('グループを削除しました');
  }
}

// テンプレ削除モーダルを開く
function openDeleteTemplateModal() {
  if (!activeTab || activeTab === 'home') {
    alert('テンプレ削除はタブ（デザイングループ）を選択した状態で使用してください。');
    return;
  }
  const group = designGroups.find(g => g.id === activeTab);
  if (!group) {
    alert('対象のグループが見つかりません。');
    return;
  }
  if (!group.designs || group.designs.length === 0) {
    alert('このタブには削除できるテンプレがありません。');
    return;
  }

  const label = document.getElementById('deleteTemplateGroupLabel');
  if (label) {
    label.textContent = `対象タブ：${group.name}（${group.designs.length}件）`;
  }

  const list = document.getElementById('deleteTemplateList');
  list.innerHTML = '';
  group.designs.forEach(design => {
    const sampleImage = design.sampleImage && design.sampleImage !== null ? design.sampleImage : 'design/no_sample_image.jpg';
    const item = document.createElement('label');
    item.style.cssText = 'display:flex; flex-direction:column; gap:0.4rem; padding:0.5rem; border:1px solid var(--border-color); border-radius:8px; cursor:pointer; background: var(--bg-elevated, transparent);';
    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <input type="checkbox" class="delete-template-checkbox" data-design-id="${design.id}">
        <span style="font-size:0.85rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${design.name || design.id}</span>
      </div>
      <div style="aspect-ratio: 16/9; overflow:hidden; border-radius:4px; background:#111;">
        <img src="${sampleImage}" alt="${design.name || ''}" style="width:100%; height:100%; object-fit:cover;">
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('.delete-template-checkbox').forEach(cb => {
    cb.addEventListener('change', updateDeleteTemplateSelectedCount);
  });

  const selectAll = document.getElementById('deleteTemplateSelectAll');
  if (selectAll) selectAll.checked = false;
  updateDeleteTemplateSelectedCount();

  const modal = document.getElementById('deleteTemplateModal');
  modal.classList.add('show');
}

function closeDeleteTemplateModal() {
  const modal = document.getElementById('deleteTemplateModal');
  modal.classList.remove('show');
}

function updateDeleteTemplateSelectedCount() {
  const count = document.querySelectorAll('#deleteTemplateList .delete-template-checkbox:checked').length;
  const el = document.getElementById('deleteTemplateSelectedCount');
  if (el) el.textContent = `${count}件選択中`;
}

function toggleDeleteTemplateSelectAll(checkbox) {
  document.querySelectorAll('#deleteTemplateList .delete-template-checkbox').forEach(cb => {
    cb.checked = checkbox.checked;
  });
  updateDeleteTemplateSelectedCount();
}

function confirmDeleteTemplates() {
  const group = designGroups.find(g => g.id === activeTab);
  if (!group) {
    alert('対象のグループが見つかりません。');
    return;
  }
  const checked = Array.from(document.querySelectorAll('#deleteTemplateList .delete-template-checkbox:checked'));
  if (checked.length === 0) {
    alert('削除するテンプレを選択してください。');
    return;
  }
  const idsToDelete = new Set(checked.map(cb => cb.dataset.designId));
  const deleteNames = group.designs.filter(d => idsToDelete.has(d.id)).map(d => d.name || d.id);

  if (!confirm(`以下のテンプレを削除します。この操作は取り消せません。\n\n・${deleteNames.join('\n・')}`)) {
    return;
  }

  group.designs = group.designs.filter(d => !idsToDelete.has(d.id));
  saveDesignGroups();
  renderDesignGroups();
  switchTab(activeTab);
  closeDeleteTemplateModal();
  showToast(`${idsToDelete.size}件のテンプレを削除しました`);
}

// デザイングループをインポート
function importDesignGroup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,.json'; // JSONも許可
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) {
      document.body.removeChild(input);
      return;
    }

    showToast('インポート処理中...');

    try {
      if (file.name.endsWith('.json')) {
        // JSONファイルの直接インポート
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.name || !Array.isArray(data.designs)) {
          throw new Error('無効なJSON形式です');
        }

        // 画像データのパス解決はできないため、パスをクリアするか、またはBase64であることを期待する
        const designs = data.designs.map(d => ({
          ...d,
          sampleImage: d.sampleImage && d.sampleImage.startsWith('data:') ? d.sampleImage : 'design/no_sample_image.jpg'
        }));

        const newGroup = {
          id: `group-${Date.now()}`,
          name: data.name,
          designs: designs
        };

        designGroups.push(newGroup);
        await saveDesignGroups();
        renderDesignGroups();

        showToast(`「${newGroup.name}」をインポートしました`);
        switchTab(newGroup.id);

      } else {
        // ZIPファイルのインポート
        const newGroup = await processZipFile(file);
        if (newGroup) {
          designGroups.push(newGroup);
          await saveDesignGroups();
          renderDesignGroups();

          showToast(`「${newGroup.name}」をインポートしました`);
          switchTab(newGroup.id);
        }
      }
    } catch (error) {
      console.error('Import error:', error);
      showToast('インポートに失敗しました: ' + error.message);
    } finally {
      document.body.removeChild(input);
    }
  });

  input.click();
}

async function processZipFile(fileOrBlob) {
  const zip = await JSZip.loadAsync(fileOrBlob);

  // design.jsonを取得
  let designJsonFile = zip.file('design.json');
  let basePath = '';

  // ルートに見つからない場合、サブフォルダ内からも探す
  if (!designJsonFile) {
    const foundPath = Object.keys(zip.files).find(path => path.endsWith('design.json') && !path.startsWith('__MACOSX'));
    if (foundPath) {
      designJsonFile = zip.file(foundPath);
      // ディレクトリパスを取得（最後のスラッシュまで）
      const lastSlashIndex = foundPath.lastIndexOf('/');
      if (lastSlashIndex !== -1) {
        basePath = foundPath.substring(0, lastSlashIndex + 1);
      }
    }
  }

  if (!designJsonFile) {
    throw new Error('design.jsonが見つかりません');
  }

  const text = await designJsonFile.async('text');
  const data = JSON.parse(text);

  // バリデーション
  if (!data.name || !Array.isArray(data.designs)) {
    throw new Error('無効なファイル形式です');
  }

  // 画像を読み込んでBase64に変換（リサイズ付き）
  const designs = [];
  for (const design of data.designs) {
    const designCopy = {
      ...design,
      useImageToImage: design.useImageToImage !== undefined ? design.useImageToImage : false
    };

    // 画像がある場合、zipから読み込む
    if (designCopy.sampleImage) {
      // 画像ファイルを探す
      let imageFile = null;

      // 1. basePath + sampleImage (最も標準的なパターン)
      const standardPath = basePath + designCopy.sampleImage;
      imageFile = zip.file(standardPath);

      // 2. まだ見つからない場合で、sampleImageがimages/で始まっていない場合は補完してみる
      if (!imageFile && !designCopy.sampleImage.startsWith('images/')) {
        const manualPath = basePath + 'images/' + designCopy.sampleImage;
        imageFile = zip.file(manualPath);
      }

      // 3. それでも見つからない場合、ファイル名だけで検索
      if (!imageFile) {
        const fileName = designCopy.sampleImage.split(/[/\\]/).pop();
        if (fileName) {
          const foundPath = Object.keys(zip.files).find(path => {
            const zipFileName = path.split(/[/\\]/).pop();
            return zipFileName === fileName && !zip.files[path].dir && !path.startsWith('__MACOSX');
          });
          if (foundPath) {
            imageFile = zip.file(foundPath);
          }
        }
      }

      if (imageFile) {
        try {
          const imageBlob = await imageFile.async('blob');

          // MIMEタイプを推測
          let mimeType = imageBlob.type;
          if (!mimeType) {
            const ext = designCopy.sampleImage.split('.').pop().toLowerCase();
            if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
            else if (ext === 'webp') mimeType = 'image/webp';
            else mimeType = 'image/jpeg';
          }

          // Blobをファイルとして扱ってリサイズ
          const fileObj = new File([imageBlob], 'image.jpg', { type: mimeType });
          const resizedBase64 = await resizeImageToBase64(fileObj, 500, 500, 0.75, 'image/webp');
          designCopy.sampleImage = resizedBase64;
        } catch (error) {
          console.error('画像のリサイズに失敗:', error);
          designCopy.sampleImage = 'design/no_sample_image.jpg';
        }
      } else if (!designCopy.sampleImage.startsWith('http') && !designCopy.sampleImage.startsWith('data:')) {
        designCopy.sampleImage = 'design/no_sample_image.jpg';
      }
    } else {
      designCopy.sampleImage = 'design/no_sample_image.jpg';
    }

    designs.push(designCopy);
  }

  // 新しいグループを作成して返す
  return {
    id: `group-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: data.name,
    designs: designs
  };
}

// ====== 常設(Permanent)グループロードロジック ======
async function loadPermanentZip(zipUrl, groupName, groupId) {
  try {
    const response = await fetch(zipUrl);
    if (!response.ok) {
      throw new Error(`Failed to load ${zipUrl}: ${response.statusText}`);
    }
    const blob = await response.blob();
    const parsed = await processZipFile(blob);
    return {
      id: groupId,
      name: groupName,
      designs: parsed.designs,
      isPermanent: true
    };
  } catch (error) {
    console.error(`Error loading permanent zip: ${zipUrl}`, error);
    return null;
  }
}

async function fetchPermanentDesignGroups() {
  const timeStamp = new Date().getTime();
  const zips = [
    { url: `assets/tags/サムネテンプレ8種.zip?t=${timeStamp}`, name: "サムネテンプレ8種", id: "permanent-thumb8" },
    { url: `assets/tags/thum7.zip?t=${timeStamp}`, name: "サムネテンプレ7種", id: "permanent-thumb7" },
    { url: `assets/tags/header5.zip?t=${timeStamp}`, name: "各種ヘッダー5種", id: "permanent-header5" },
    { url: `assets/tags/chirashi.zip?t=${timeStamp}`, name: "チラシ", id: "permanent-chirashi" },
    { url: `assets/tags/manga12.zip?t=${timeStamp}`, name: "マンガ", id: "permanent-manga" },
    { url: `assets/tags/Kindle.zip?t=${timeStamp}`, name: "Kindleテンプレート", id: "permanent-kindle" }
  ];

  const results = [];
  for (const z of zips) {
    const r = await loadPermanentZip(z.url, z.name, z.id);
    if (r !== null) results.push(r);
  }
  return results;
}

// デザイングループをエクスポート
async function exportDesignGroup() {
  if (designGroups.length === 0) {
    alert('エクスポートできるグループがありません');
    return;
  }

  // 現在のタブがカスタムグループなら、それをエクスポート
  if (activeTab === 'home') {
    alert('ホームはエクスポートできません。カスタムグループのタブに切り替えてからエクスポートしてください。');
    return;
  }

  const group = designGroups.find(g => g.id === activeTab);

  if (!group) {
    alert('エクスポートするグループを選択してください');
    return;
  }

  try {
    // JSZipインスタンスを作成
    const zip = new JSZip();

    // デザインデータを準備（画像パスは相対パスに変更）
    const exportData = {
      name: group.name,
      designs: group.designs.map(design => ({
        ...design,
        sampleImage: design.sampleImage ? `images/${design.id}.jpg` : ''
      }))
    };

    // design.jsonを追加
    zip.file('design.json', JSON.stringify(exportData, null, 2));

    // imagesフォルダを作成
    const imagesFolder = zip.folder('images');

    // 各デザインのサンプル画像を追加
    for (const design of group.designs) {
      if (design.sampleImage && design.sampleImage.startsWith('data:')) {
        // Base64画像の場合
        const base64Data = design.sampleImage.split(',')[1];
        imagesFolder.file(`${design.id}.jpg`, base64Data, { base64: true });
      } else if (design.sampleImage && design.sampleImage !== 'design/no_sample_image.jpg') {
        // 外部URLの場合は取得してzipに追加
        try {
          const response = await fetch(design.sampleImage);
          const blob = await response.blob();
          imagesFolder.file(`${design.id}.jpg`, blob);
        } catch (error) {
          console.error(`Failed to fetch image for ${design.id}:`, error);
        }
      }
    }

    // zipファイルを生成
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // ダウンロード
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${group.name}-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`「${group.name}」をエクスポートしました`);
  } catch (error) {
    console.error('Export error:', error);
    showToast('エクスポートに失敗しました: ' + error.message);
  }
}

// イベントリスナーの設定（初回のみ）
let eventListenersSetup = false;

function setupEventListeners() {
  if (eventListenersSetup) return;
  eventListenersSetup = true;

  // テキストエリアの文字数カウント
  pageContentTextarea.addEventListener('input', updateCharCount);

  // 生成・キャンセルボタン（イベント委譲）
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('generate-btn')) {
      handleStyleSelection(e.target);
    } else if (e.target.classList.contains('cancel-btn')) {
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
    }
  });

  apiSettingsBtn.addEventListener('click', openApiModal);
  closeModal.addEventListener('click', closeApiModal);
  cancelApiBtn.addEventListener('click', closeApiModal);
  saveApiBtn.addEventListener('click', saveApiKey);

  document.querySelectorAll('input[name="provider"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const newProvider = e.target.value;
      // 切り替え前のキーを一時保存し、切り替え先のキーを入力欄に表示
      if (newProvider === 'openai') {
        apiKeyInput.value = openaiApiKey || '';
      } else {
        apiKeyInput.value = falApiKey || '';
      }
      updateApiModalForProvider(newProvider);
    });
  });

  // 画像拡大モーダル
  imageModal.addEventListener('click', (e) => {
    // オーバーレイクリック時のみ閉じる（コンテンツ内クリックは閉じない）
    if (e.target === imageModal) {
      closeImageModal();
    }
  });

  // 閉じるボタンのイベントリスナー
  const closeImageModalBtn = document.getElementById('closeImageModalBtn');
  if (closeImageModalBtn) {
    closeImageModalBtn.addEventListener('click', closeImageModal);
  }

  // Nanobananaへの遷移ボタン
  const nanobananaBtn = document.getElementById('nanobananaBtn');
  if (nanobananaBtn) {
    nanobananaBtn.addEventListener('click', () => {
      const currentImageUrl = modalImage.src;
      if (currentImageUrl && !currentImageUrl.includes('first_image.jpg') && currentImageUrl !== 'design/no_sample_image.jpg') {
        // 画像をクリップボードにコピーしてGemini(Nanobanana)を開く
        copyImageToClipboard(currentImageUrl);
        showToast('画像をコピーしました。GeminiのNanobananaで貼り付けて編集してください。', 4000);
        setTimeout(() => {
          window.open('https://gemini.google.com/app', '_blank');
        }, 1200);
      } else {
        window.open('https://gemini.google.com/app', '_blank');
      }
    });
  }

  // APIモーダルの外側をクリックしたら閉じる
  window.addEventListener('click', (e) => {
    if (e.target === apiModal) {
      closeApiModal();
    }
  });

  // サムネ生成管理ツールの連携機能
  const thumbGenSettingsBtn = document.getElementById('thumbGenSettingsBtn');
  const thumbGenApiModal = document.getElementById('thumbGenApiModal');
  const cancelThumbGenApiBtn = document.getElementById('cancelThumbGenApiBtn');
  const saveThumbGenApiBtn = document.getElementById('saveThumbGenApiBtn');
  const closeThumbGenBtn = document.querySelector('.close-thumb-gen');
  const thumbGenApiKeyInput = document.getElementById('thumbGenApiKeyInput');
  const thumbGenLaunchBtn = document.getElementById('thumbGenLaunchBtn');

  if (thumbGenSettingsBtn) {
    thumbGenSettingsBtn.addEventListener('click', () => {
      thumbGenApiKeyInput.value = thumbGenApiKey || '';
      if (thumbGenApiModal) thumbGenApiModal.classList.add('show');
    });
  }

  const closeThumbGenModalFunc = () => {
    if (thumbGenApiModal) thumbGenApiModal.classList.remove('show');
  };

  if (closeThumbGenBtn) closeThumbGenBtn.addEventListener('click', closeThumbGenModalFunc);
  if (cancelThumbGenApiBtn) cancelThumbGenApiBtn.addEventListener('click', closeThumbGenModalFunc);
  
  if (saveThumbGenApiBtn) {
    saveThumbGenApiBtn.addEventListener('click', async () => {
      const newKey = thumbGenApiKeyInput.value.trim();
      thumbGenApiKey = newKey;
      await window.browserStorage.set({ thumbGenApiKey: newKey });
      showToast('サムネ生成ツール用APIキーを保存しました');
      closeThumbGenModalFunc();
    });
  }

  if (thumbGenLaunchBtn) {
    thumbGenLaunchBtn.addEventListener('click', () => {
      openThumbGenToolModal();
    });
  }

  // サムネ生成APIモーダルの外側をクリックしたら閉じる
  window.addEventListener('click', (e) => {
    if (e.target === thumbGenApiModal) {
      closeThumbGenModalFunc();
    }
  });

  // 画像アップロード機能の初期化
  setupImageUpload();

  // アスペクト比が変更されたときにプレビュー枠のサイズを柔軟に調整する
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('aspect-ratio-select')) {
      const designArea = e.target.closest('.design-area');
      if (designArea) {
        const generatedImageWrapper = designArea.querySelector('.design-wrapper.generated-image');
        if (generatedImageWrapper) {
          generatedImageWrapper.style.aspectRatio = e.target.value.replace(':', '/');
        }
      }
    }
  });
}

// APIキーの読み込み
async function loadApiKey() {
  const result = await window.browserStorage.get(['falApiKey', 'openaiApiKey', 'selectedProvider', 'thumbGenApiKey']);
  if (result.falApiKey) {
    falApiKey = result.falApiKey;
  }
  if (result.openaiApiKey) {
    openaiApiKey = result.openaiApiKey;
  }
  if (result.thumbGenApiKey) {
    thumbGenApiKey = result.thumbGenApiKey;
  }
  if (result.selectedProvider) {
    selectedProvider = result.selectedProvider;
  }
}

// APIモーダルを開く
function openApiModal() {
  // ラジオボタンを現在のプロバイダーに合わせてセット
  const radioFal = document.getElementById('providerFal');
  const radioOpenai = document.getElementById('providerOpenai');
  if (radioFal && radioOpenai) {
    radioFal.checked = selectedProvider === 'fal';
    radioOpenai.checked = selectedProvider === 'openai';
  }
  // 対応するキーを入力欄に復元
  apiKeyInput.value = selectedProvider === 'openai' ? (openaiApiKey || '') : (falApiKey || '');
  updateApiModalForProvider(selectedProvider);
  apiModal.classList.add('show');
}

// プロバイダー切り替え時にモーダルUIを更新するヘルパー
function updateApiModalForProvider(provider) {
  const guideBlockFal = document.getElementById('guideBlockFal');
  const guideBlockOpenai = document.getElementById('guideBlockOpenai');
  const apiKeyLabel = document.getElementById('apiKeyLabel');

  if (provider === 'openai') {
    if (guideBlockFal) guideBlockFal.style.display = 'none';
    if (guideBlockOpenai) guideBlockOpenai.style.display = '';
    if (apiKeyLabel) apiKeyLabel.textContent = 'OpenAI API Key';
    apiKeyInput.placeholder = 'APIキーを入力してください (例: sk-...)';
  } else {
    if (guideBlockFal) guideBlockFal.style.display = '';
    if (guideBlockOpenai) guideBlockOpenai.style.display = 'none';
    if (apiKeyLabel) apiKeyLabel.textContent = 'FAL API Key';
    apiKeyInput.placeholder = 'APIキーを入力してください (例: fal_key_...)';
  }
}

// APIモーダルを閉じる
function closeApiModal() {
  apiModal.classList.remove('show');
}

// 画像拡大モーダルを開く
function openImageModal(imageUrl, style = 'design') {
  modalImage.src = imageUrl;
  imageModal.style.display = 'flex';

  const downloadBtn = document.getElementById('modalDownloadBtn');
  if (downloadBtn) {
    // 古いイベントリスナーを削除するためにクローンを作成
    const newBtn = downloadBtn.cloneNode(true);
    downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);

    newBtn.addEventListener('click', () => {
      downloadImage(imageUrl, style);
    });

    // 画像が無効な場合はボタンを無効化
    newBtn.disabled = !imageUrl || imageUrl.includes('first_image.jpg');
  }

  const copyBtn = document.getElementById('modalCopyBtn');
  if (copyBtn) {
    // 古いイベントリスナーを削除するためにクローンを作成
    const newCopyBtn = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);

    newCopyBtn.addEventListener('click', () => {
      copyImageToClipboard(imageUrl);
    });

    // 画像が無効な場合はボタンを無効化
    newCopyBtn.disabled = !imageUrl || imageUrl.includes('first_image.jpg');
    // 無効時のスタイル調整
    if (newCopyBtn.disabled) {
      newCopyBtn.style.opacity = '0.5';
      newCopyBtn.style.cursor = 'not-allowed';
    } else {
      newCopyBtn.style.opacity = '1';
      newCopyBtn.style.cursor = 'pointer';
    }
  }
}

// 画像拡大モーダルを閉じる
function closeImageModal() {
  imageModal.style.display = 'none';
}

// APIキー警告表示のチェック
function checkApiKeyWarning() {
  const warningElement = document.getElementById('apiKeyWarning');
  if (!warningElement) return;

  const activeKey = selectedProvider === 'openai' ? openaiApiKey : falApiKey;
  if (!activeKey || activeKey.trim() === '') {
    warningElement.style.display = 'inline-block';
  } else {
    warningElement.style.display = 'none';
  }
}

// APIキーを保存
async function saveApiKey() {
  const newApiKey = apiKeyInput.value.trim();
  if (!newApiKey) {
    alert('APIキーを入力してください');
    return;
  }

  // 選択中のプロバイダーを読み取る
  const radioOpenai = document.getElementById('providerOpenai');
  const newProvider = (radioOpenai && radioOpenai.checked) ? 'openai' : 'fal';

  // プロバイダーが変わった場合はキャッシュをクリア
  if (newProvider !== selectedProvider) {
    generatedImages = {};
  }

  selectedProvider = newProvider;

  if (selectedProvider === 'openai') {
    openaiApiKey = newApiKey;
    await window.browserStorage.set({ openaiApiKey: newApiKey, selectedProvider: 'openai' });
  } else {
    falApiKey = newApiKey;
    await window.browserStorage.set({ falApiKey: newApiKey, selectedProvider: 'fal' });
  }

  alert('APIキーを保存しました');
  closeApiModal();

  checkApiKeyWarning();
}

// サンプル画像のクリックイベントを設定
// サンプル画像クリックイベント（初回のみ、イベント委譲を使用）
let sampleImageListenerSetup = false;

function setupSampleImageClickEvents() {
  if (sampleImageListenerSetup) return;
  sampleImageListenerSetup = true;

  document.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG' && e.target.closest('.sample-image')) {
      openImageModal(e.target.src, 'sample');
    }
  });
}

// 文字数カウントの更新
function updateCharCount() {
  const count = pageContentTextarea.value.length;
  charCountSpan.textContent = count.toLocaleString();
}

// スタイル選択の処理
let currentAbortController = null;

async function handleStyleSelection(button) {
  const style = button.dataset.style;
  const groupId = button.dataset.group || 'home';
  const displayContainerId = groupId === 'home' ? `design-${style}` : `design-${groupId}-${style}`;
  const displayContainer = document.getElementById(displayContainerId);
  const designArea = button.closest('.design-area');
  const downloadBtn = designArea.querySelector('.download-btn');
  const copyBtn = designArea.querySelector('.copy-btn');

  // アスペクト比を取得
  const aspectRatioSelect = designArea.querySelector('.aspect-ratio-select');
  const aspectRatio = aspectRatioSelect ? aspectRatioSelect.value : '16:9';

  // 元のボタンテキストを保存
  const originalText = button.textContent;

  // ボタンを「キャンセル」に変更
  button.textContent = 'キャンセル';
  button.classList.remove('generate-btn');
  button.classList.add('cancel-btn');

  // 生成中の画像要素を取得
  const generatedImageWrapper = displayContainer.querySelector('.generated-image');

  // ローディング表示を生成画像の上に追加
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'design-loading';
  loadingDiv.innerHTML = '<div class="design-spinner"></div><div class="design-loading-text">生成中...</div>';
  generatedImageWrapper.appendChild(loadingDiv);

  // AbortControllerを作成
  currentAbortController = new AbortController();
  const abortSignal = currentAbortController.signal;

  try {
    // サムネイル生成
    const imageUrl = await generateThumbnail(style, groupId, aspectRatio, abortSignal);

    // ローディング表示を削除
    generatedImageWrapper.removeChild(loadingDiv);

    // 生成された画像に入れ替え
    if (generatedImageWrapper) {
      generatedImageWrapper.style.aspectRatio = aspectRatio.replace(':', '/');
      const img = generatedImageWrapper.querySelector('img');
      img.src = imageUrl;
      img.alt = `${style}スタイルのデザイン`;

      // 古いイベントリスナーを削除する（クローン）
      const newImg = img.cloneNode(true);
      img.parentNode.replaceChild(newImg, img);

      newImg.addEventListener('click', () => openImageModal(imageUrl, style));
    }

    // 自動的にポップアップを表示
    openImageModal(imageUrl, style);

    // 生成画像を保存
    if (!generatedImages[style]) {
      generatedImages[style] = [];
    }
    generatedImages[style].push(imageUrl);

    // ダウンロード・コピーボタンを有効化し、最新画像に対応
    downloadBtn.disabled = false;
    copyBtn.disabled = false;

    downloadBtn.onclick = () => downloadImage(imageUrl, style);
    copyBtn.onclick = () => copyImageToClipboard(imageUrl);

  } catch (error) {
    // ローディング表示を削除
    if (generatedImageWrapper.contains(loadingDiv)) {
      generatedImageWrapper.removeChild(loadingDiv);
    }

    // キャンセルされた場合
    if (error.name === 'AbortError') {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'design-loading';
      messageDiv.style.cursor = 'default';
      messageDiv.innerHTML = `
        <div style="color: #95a5a6; font-size: 14px; font-weight: bold;">🚫 キャンセルしました</div>
        <div style="color: #7f8c8d; font-size: 12px; margin-top: 8px;">画像生成をキャンセルしました</div>
      `;
      generatedImageWrapper.appendChild(messageDiv);

      setTimeout(() => {
        if (generatedImageWrapper.contains(messageDiv)) {
          generatedImageWrapper.removeChild(messageDiv);
        }
      }, 3000);
    } else {
      // タイムアウトまたはエラーメッセージを表示
      const messageDiv = document.createElement('div');
      messageDiv.className = 'design-loading';
      messageDiv.style.cursor = 'default';

      if (error.message && error.message.includes('タイムアウト')) {
        messageDiv.innerHTML = `
          <div style="color: #e67e22; font-size: 14px; font-weight: bold;">⏱️ タイムアウトしました</div>
          <div style="color: #7f8c8d; font-size: 12px; margin-top: 8px;">画像生成に時間がかかっています。もう一度「生成」ボタンを押してください。</div>
        `;
      } else if (error.message && (error.message.includes('FAL_BALANCE_INSUFFICIENT') || error.message.includes('OPENAI_BALANCE_INSUFFICIENT'))) {
        messageDiv.innerHTML = `
          <div style="color: #e67e22; font-size: 14px; font-weight: bold;">💳 APIの残高が不足しています</div>
          <div style="color: #7f8c8d; font-size: 12px; margin-top: 8px;">API料金を追加してから、もう一度お試しください。</div>
        `;
      } else if (error.message && error.message.includes('APIキーが設定されていません')) {
        messageDiv.innerHTML = `
          <div style="color: #e74c3c; font-size: 14px; font-weight: bold;">❌ APIキーが設定されていません</div>
          <div style="color: #7f8c8d; font-size: 12px; margin-top: 8px;">右上の「⚙️ API設定」ボタンからAPIキーを入力してください</div>
        `;
      } else if (error.message && error.message.includes('OPENAI_ORG_NOT_VERIFIED')) {
        messageDiv.innerHTML = `
          <div style="color: #e67e22; font-size: 14px; font-weight: bold;">🪪 組織の本人確認が必要です</div>
          <div style="color: #7f8c8d; font-size: 12px; margin-top: 8px;">OpenAIの<a href="https://platform.openai.com/settings/organization/general" target="_blank" style="color:#3498db;">組織設定ページ</a>で「Verify Organization」を完了してから、約15分待って再度お試しください。</div>
        `;
      } else {
        const providerLabel = (selectedProvider === 'openai') ? 'OpenAI' : 'FAL';
        const detail = (error && error.message) ? String(error.message).replace(/</g, '&lt;') : '不明なエラー';
        messageDiv.innerHTML = `
          <div style="color: #e74c3c; font-size: 14px; font-weight: bold;">✖️ 生成に失敗しました（${providerLabel}）</div>
          <div style="color: #7f8c8d; font-size: 12px; margin-top: 8px;">${detail}</div>
          <div style="color: #95a5a6; font-size: 11px; margin-top: 6px;">APIキーや残高、ネットワーク接続をご確認ください。詳細はブラウザの開発者ツール（コンソール）で確認できます。</div>
        `;
      }

      generatedImageWrapper.appendChild(messageDiv);

      // 10秒後にメッセージを削除（タイムアウト・残高不足の場合は長めに表示）
      const displayTime = (error.message && (error.message.includes('タイムアウト') || error.message.includes('FAL_BALANCE_INSUFFICIENT') || error.message.includes('OPENAI_BALANCE_INSUFFICIENT'))) ? 10000 : 5000;
      setTimeout(() => {
        if (generatedImageWrapper.contains(messageDiv)) {
          generatedImageWrapper.removeChild(messageDiv);
        }
      }, displayTime);
    }
  } finally {
    // ボタンを元に戻す
    button.textContent = originalText;
    button.classList.add('generate-btn');
    button.classList.remove('cancel-btn');
    button.disabled = false;
    currentAbortController = null;
  }
}

// サムネイル生成
async function generateThumbnail(style, groupId = 'home', aspectRatio = '16:9', abortSignal = null) {
  // 画像生成API呼び出し
  const imageUrl = await callImageGenerationAPI(style, groupId, aspectRatio, abortSignal);

  return imageUrl;
}

// 選択されたテーマカラーを取得
function getSelectedThemeColor() {
  const selectedRadio = document.querySelector('input[name="themeColor"]:checked');
  return selectedRadio ? selectedRadio.value : 'auto';
}

// 画像生成API呼び出し
async function callImageGenerationAPI(style, groupId = 'home', aspectRatio = '16:9', abortSignal = null) {
  console.log('Generating image with style:', style, 'groupId:', groupId, 'aspectRatio:', aspectRatio);

  // OpenAI プロバイダーの場合は専用関数へ委譲
  if (selectedProvider === 'openai') {
    return await callOpenaiAPI(style, groupId, aspectRatio, abortSignal);
  }

  // APIキーのチェック（FAL AI）
  if (!falApiKey || falApiKey.trim() === '') {
    throw new Error('APIキーが設定されていません。右上の「⚙️ API設定」ボタンからAPIキーを入力してください。');
  }

  // タイトルとページ内容を取得
  const title = titleInput.value.trim();
  const content = pageContentTextarea.value;

  // テーマカラーを取得
  const themeColor = getSelectedThemeColor();

  // プロンプトを取得
  let stylePrompt = '';

  if (groupId === 'home') {
    // ホームタブの場合はデフォルトのデザイン設定から取得
    const designs = designConfig.designs || designConfig.styles || [];
    const styleConfig = designs.find(s => s.id === style);
    stylePrompt = styleConfig ? styleConfig.prompt : '';
  } else {
    // カスタムグループの場合はグループのデザイン設定から取得
    const group = designGroups.find(g => g.id === groupId);
    if (group && group.designs) {
      const design = group.designs.find(d => d.id === style);
      stylePrompt = design ? design.prompt : '';
    }
  }

  // テーマカラーに応じた色指定
  const colorInstructions = {
    auto: '',
    red: '\n- Primary color scheme: Red tones (#e74c3c, crimson, burgundy)',
    blue: '\n- Primary color scheme: Blue tones (#3498db, navy, sky blue)',
    green: '\n- Primary color scheme: Green tones (#2ecc71, forest green, emerald)',
    yellow: '\n- Primary color scheme: Yellow tones (#f1c40f, gold, amber)',
    purple: '\n- Primary color scheme: Purple tones (#9b59b6, violet, lavender)',
    orange: '\n- Primary color scheme: Orange tones (#e67e22, coral, tangerine)',
    pink: '\n- Primary color scheme: Pink tones (#ec7aa5, rose, magenta)',
    white: '\n- Primary color scheme: White and light tones (#ffffff, ivory, cream, light gray)',
    navy: '\n- Primary color scheme: Navy tones (#34495e, dark blue, midnight blue)',
    gray: '\n- Primary color scheme: Gray tones (#95a5a6, silver, charcoal)',
    black: '\n- Primary color scheme: Black and dark tones (#2c3e50, charcoal, slate)'
  };

  // プロンプトを生成（タイトルと記事本文を含める）
  let fullPrompt = stylePrompt;

  // テーマカラーの指定を追加
  if (themeColor !== 'auto') {
    fullPrompt += colorInstructions[themeColor] || '';
  }

  // コンテンツ処理の指示を追加
  fullPrompt += '\n\nContent Guidelines:';
  fullPrompt += '\n- Focus on the core topic and main message from the article';
  fullPrompt += '\n- Include dates ONLY if they are central to the story (e.g., historical events, commemorations, time-sensitive announcements)';
  fullPrompt += '\n- Exclude irrelevant metadata like publication dates, last updated timestamps, author names, or page numbers';
  fullPrompt += '\n- DO NOT include temporal/dimensional information such as: "today\'s date" (今日の日付), "article count" (残り記事数), "reading time estimates", "view counts", "share counts", or similar statistics';
  fullPrompt += '\n- Extract and emphasize the key points that would attract viewers';

  fullPrompt += '\n\n';

  if (title) {
    fullPrompt += `タイトル: ${title}\n\n`;
  }

  fullPrompt += `記事本文:\n${content.substring(0, 1000)}`;

  // アスペクト比はパラメータから取得（aspectRatio変数は既に存在）

  // サンプル画像のパスとuseImageToImageフラグを取得
  let sampleImagePath = '';
  let useImageToImage = false;
  if (groupId === 'home') {
    const designs = designConfig.designs || designConfig.styles || [];
    const styleConfig = designs.find(s => s.id === style);
    sampleImagePath = styleConfig ? styleConfig.sampleImage : '';
    useImageToImage = styleConfig ? (styleConfig.useImageToImage || false) : false;
  } else {
    const group = designGroups.find(g => g.id === groupId);
    if (group && group.designs) {
      const design = group.designs.find(d => d.id === style);
      sampleImagePath = design ? design.sampleImage : '';
      useImageToImage = design ? (design.useImageToImage || false) : false;
    }
  }

  // 参考画像の有無を判定してeditエンドポイントを使用するか決定
  let useEditEndpoint = false;
  const imageUrls = [];

  console.log('=== 画像アップロード処理開始 ===');
  console.log('サンプル画像パス:', sampleImagePath);
  console.log('useImageToImageフラグ:', useImageToImage);
  console.log('キャラクター画像あり:', !!characterImageBase64);
  console.log('デザイン参考画像あり:', !!designImageBase64);

  // useImageToImageがtrueの場合のみサンプル画像を使用
  // その他、キャラクター画像、デザイン参考画像のいずれかがある場合はeditエンドポイントを使用
  const shouldUseSampleImage = useImageToImage && sampleImagePath && sampleImagePath !== null;
  const hasAnyImage = shouldUseSampleImage || characterImageBase64 || designImageBase64;

  if (hasAnyImage) {
    useEditEndpoint = true;
    console.log('参考画像が存在するため、editエンドポイントを使用します');

    // useImageToImageがtrueの場合のみサンプル画像を追加（スタイルの基準として）
    if (shouldUseSampleImage) {
      try {
        console.log('サンプル画像を処理中:', sampleImagePath);

        // Base64データURIに変換
        let sampleImageDataUri;
        if (sampleImagePath.startsWith('data:')) {
          console.log('サンプル画像はすでにBase64データURIです');
          sampleImageDataUri = sampleImagePath;
        } else {
          console.log('サンプル画像をBase64データURIに変換します');
          sampleImageDataUri = await convertImageToBase64(sampleImagePath);
        }

        if (sampleImageDataUri) {
          // FAL CDNにアップロードを試行
          const uploadResult = await uploadToFalCDN(sampleImageDataUri, 'sample.jpg');

          if (uploadResult.url) {
            console.log('✓ サンプル画像をFAL CDNにアップロード成功:', uploadResult.url);
            imageUrls.push(uploadResult.url);
          } else {
            console.warn('⚠ FAL CDNアップロード失敗、Base64にフォールバック');
            imageUrls.push(sampleImageDataUri);
          }
        } else {
          console.warn('⚠ サンプル画像の変換に失敗しました');
        }
      } catch (error) {
        console.error('✗ サンプル画像の処理に失敗しました:', error);
        console.error('エラー詳細:', error.message);
      }
    }

    // キャラクター画像を追加
    if (characterImageBase64) {
      try {
        console.log('キャラクター画像を処理中');

        // FAL CDNにアップロードを試行
        const uploadResult = await uploadToFalCDN(characterImageBase64, 'character.jpg');

        if (uploadResult.url) {
          console.log('✓ キャラクター画像をFAL CDNにアップロード成功:', uploadResult.url);
          imageUrls.push(uploadResult.url);
        } else {
          console.warn('⚠ FAL CDNアップロード失敗、Base64にフォールバック');
          imageUrls.push(characterImageBase64);
        }
      } catch (error) {
        console.error('✗ キャラクター画像の処理に失敗、Base64を使用:', error);
        imageUrls.push(characterImageBase64);
      }
    }

    // デザイン参考画像を追加
    if (designImageBase64) {
      try {
        console.log('デザイン参考画像を処理中');

        // FAL CDNにアップロードを試行
        const uploadResult = await uploadToFalCDN(designImageBase64, 'design.jpg');

        if (uploadResult.url) {
          console.log('✓ デザイン参考画像をFAL CDNにアップロード成功:', uploadResult.url);
          imageUrls.push(uploadResult.url);
        } else {
          console.warn('⚠ FAL CDNアップロード失敗、Base64にフォールバック');
          imageUrls.push(designImageBase64);
        }
      } catch (error) {
        console.error('✗ デザイン参考画像の処理に失敗、Base64を使用:', error);
        imageUrls.push(designImageBase64);
      }
    }

    console.log('=== 画像アップロード処理完了 ===');
    console.log('アップロードされた画像数:', imageUrls.length);
    console.log('画像URLs:', imageUrls);
  } else {
    console.log('参考画像がないため、通常のエンドポイントを使用します');
  }

  // APIリクエストボディの構築
  const requestBody = {
    prompt: fullPrompt,
    num_images: 1,
    aspect_ratio: aspectRatio,
    output_format: 'jpeg',
    resolution: '1K'
  };

  // 参考画像がある場合は追加（image_urlsパラメータを使用）
  if (useEditEndpoint && imageUrls.length > 0) {
    requestBody.image_urls = imageUrls;

    // プロンプトに参考画像の指示を追加
    let imageInstructions = '\n\n参考画像の使用指示:';

    // サンプル画像の指示（スタイルのベースとなる画像）
    // nullの場合はスキップ
    if (sampleImagePath && sampleImagePath !== null) {
      imageInstructions += '\n- Sample image (1st image): Use this as a comprehensive style reference. IMPORTANT: Match the overall atmosphere, composition, layout structure, text amount and placement, visual hierarchy, graphic element styles, and design patterns. However, DO NOT create an exact copy - maintain originality by using the specified theme color, adapting the content to the article topic, and creating unique visual elements while preserving the same design language and aesthetic feel. Think of it as creating a design in the same style and mood, not duplicating the reference.';
    }

    // キャラクター画像の指示
    if (characterImageBase64) {
      imageInstructions += '\n- Character image: Include this character in the thumbnail with an appropriate facial expression and pose that fits the article content and mood. Maintain the character\'s design and features accurately.';
    }

    // デザイン参考画像の指示
    if (designImageBase64) {
      imageInstructions += '\n- Design reference image: Use this as a comprehensive reference including structure, composition, color scheme, layout, and overall aesthetic. Follow this design direction closely.';
    }

    requestBody.prompt += imageInstructions;
  }

  // 使用するAPIエンドポイントを決定
  const apiEndpoint = useEditEndpoint
    ? 'https://queue.fal.run/fal-ai/nano-banana-pro/edit'
    : 'https://queue.fal.run/fal-ai/nano-banana-pro';

  console.log('=== API リクエスト情報 ===');
  console.log('サンプル画像パス:', sampleImagePath);
  console.log('editエンドポイント使用:', useEditEndpoint);
  console.log('使用するエンドポイント:', apiEndpoint);
  console.log('参考画像数:', imageUrls.length);
  if (imageUrls.length > 0) {
    console.log('画像URL:', imageUrls);
  }
  console.log('リクエストボディ:', JSON.stringify(requestBody, null, 2));
  console.log('image_urlsパラメータが含まれているか:', 'image_urls' in requestBody);
  if ('image_urls' in requestBody) {
    console.log('image_urlsの内容:', requestBody.image_urls);
  }

  // FAL AI APIを呼び出す
  try {
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    };

    // AbortSignalを追加
    if (abortSignal) {
      fetchOptions.signal = abortSignal;
    }

    const response = await fetch(apiEndpoint, fetchOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const isBalanceError = response.status === 402 ||
        (errorData.detail && ['balance', 'credit', 'payment', 'insufficient'].some(function(kw) {
          return errorData.detail.toLowerCase().indexOf(kw) !== -1;
        }));
      if (isBalanceError) {
        throw new Error('FAL_BALANCE_INSUFFICIENT');
      }
      throw new Error(`API Error: ${response.status} - ${errorData.detail || response.statusText}`);
    }

    const data = await response.json();
    console.log('FAL API Response:', data);

    // request_idを取得
    const requestId = data.request_id;
    const statusUrl = data.status_url || `${apiEndpoint}/requests/${requestId}/status`;
    const resultUrl = data.response_url || `${apiEndpoint}/requests/${requestId}`;

    console.log('Polling URLs:', {
      requestId,
      statusUrl,
      resultUrl
    });

    // ポーリングで結果を取得
    const result = await pollForResult(requestId, statusUrl, resultUrl, abortSignal);

    // 画像URLを返す
    if (result.images && result.images.length > 0) {
      return result.images[0].url;
    } else {
      throw new Error('画像の生成に失敗しました');
    }

  } catch (error) {
    console.error('FAL API Error:', error);
    throw error;
  }
}

// OpenAI gpt-image-2 用のアスペクト比→sizeパラメータ変換
// gpt-image-2 がサポートするサイズ: 1024x1024 / 1536x1024 / 1024x1536 / auto
function mapAspectRatioToSize(aspectRatio) {
  const landscape = new Set(['16:9', '5:2', '3:2', '4:3']);
  const portrait  = new Set(['9:16', '2:3', '3:4']);
  if (aspectRatio === '1:1') return '1024x1024';
  if (landscape.has(aspectRatio)) return '1536x1024';
  if (portrait.has(aspectRatio)) return '1024x1536';
  return '1024x1024';
}

async function callOpenaiAPI(style, groupId, aspectRatio, abortSignal) {
  console.log('Generating image with OpenAI gpt-image-2: style:', style, 'groupId:', groupId, 'aspectRatio:', aspectRatio);

  if (!openaiApiKey || openaiApiKey.trim() === '') {
    throw new Error('OpenAIのAPIキーが設定されていません。右上の「⚙️ API設定」ボタンからAPIキーを入力してください。');
  }

  // タイトルとページ内容を取得
  const title = titleInput.value.trim();
  const content = pageContentTextarea.value;
  const themeColor = getSelectedThemeColor();

  // プロンプトを取得
  let stylePrompt = '';
  if (groupId === 'home') {
    const designs = designConfig.designs || designConfig.styles || [];
    const styleConfig = designs.find(s => s.id === style);
    stylePrompt = styleConfig ? styleConfig.prompt : '';
  } else {
    const group = designGroups.find(g => g.id === groupId);
    if (group && group.designs) {
      const design = group.designs.find(d => d.id === style);
      stylePrompt = design ? design.prompt : '';
    }
  }

  const colorInstructions = {
    auto: '',
    red: '\n- Primary color scheme: Red tones (#e74c3c, crimson, burgundy)',
    blue: '\n- Primary color scheme: Blue tones (#3498db, navy, sky blue)',
    green: '\n- Primary color scheme: Green tones (#2ecc71, forest green, emerald)',
    yellow: '\n- Primary color scheme: Yellow tones (#f1c40f, gold, amber)',
    purple: '\n- Primary color scheme: Purple tones (#9b59b6, violet, lavender)',
    orange: '\n- Primary color scheme: Orange tones (#e67e22, coral, tangerine)',
    pink: '\n- Primary color scheme: Pink tones (#ec7aa5, rose, magenta)',
    white: '\n- Primary color scheme: White and light tones (#ffffff, ivory, cream, light gray)',
    navy: '\n- Primary color scheme: Navy tones (#34495e, dark blue, midnight blue)',
    gray: '\n- Primary color scheme: Gray tones (#95a5a6, silver, charcoal)',
    black: '\n- Primary color scheme: Black and dark tones (#2c3e50, charcoal, slate)'
  };

  let fullPrompt = stylePrompt;
  if (themeColor !== 'auto') {
    fullPrompt += colorInstructions[themeColor] || '';
  }
  fullPrompt += '\n\nContent Guidelines:';
  fullPrompt += '\n- Focus on the core topic and main message from the article';
  fullPrompt += '\n- Include dates ONLY if they are central to the story (e.g., historical events, commemorations, time-sensitive announcements)';
  fullPrompt += '\n- Exclude irrelevant metadata like publication dates, last updated timestamps, author names, or page numbers';
  fullPrompt += '\n- DO NOT include temporal/dimensional information such as: "today\'s date" (今日の日付), "article count" (残り記事数), "reading time estimates", "view counts", "share counts", or similar statistics';
  fullPrompt += '\n- Extract and emphasize the key points that would attract viewers';
  fullPrompt += '\n\n';
  if (title) {
    fullPrompt += `タイトル: ${title}\n\n`;
  }
  fullPrompt += `記事本文:\n${content.substring(0, 1000)}`;

  // gpt-image-2 を優先し、未公開/未提供の場合は gpt-image-1 へ自動フォールバック
  const modelCandidates = ['gpt-image-2', 'gpt-image-1'];
  let lastError = null;

  for (const modelName of modelCandidates) {
    const requestBody = {
      model: modelName,
      prompt: fullPrompt,
      n: 1,
      size: mapAspectRatioToSize(aspectRatio),
    };

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    };

    if (abortSignal) {
      fetchOptions.signal = abortSignal;
    }

    try {
      console.log(`OpenAI image request: model=${modelName}, size=${requestBody.size}`);
      const response = await fetch('https://api.openai.com/v1/images/generations', fetchOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = (errorData.error && errorData.error.message) || '';
        const errCode = (errorData.error && errorData.error.code) || '';
        const errType = (errorData.error && errorData.error.type) || '';
        console.error(`OpenAI ${response.status} (model=${modelName}):`, errorData);

        // モデル未提供 → 次の候補へフォールバック
        const isModelMissing =
          errCode === 'model_not_found' ||
          errType === 'invalid_request_error' && /model/i.test(errMsg) && /(not.*found|does not exist|unknown)/i.test(errMsg);
        if (isModelMissing && modelName !== modelCandidates[modelCandidates.length - 1]) {
          console.warn(`Model ${modelName} not available, falling back to next candidate`);
          lastError = new Error(`OpenAI API Error: ${response.status} - ${errMsg || response.statusText}`);
          continue;
        }

        // 残高不足
        const isBalanceError = response.status === 402 ||
          ['billing', 'quota', 'insufficient_quota', 'balance', 'credit', 'payment', 'insufficient'].some(kw =>
            errMsg.toLowerCase().includes(kw) || String(errCode).toLowerCase().includes(kw)
          );
        if (isBalanceError) {
          throw new Error('OPENAI_BALANCE_INSUFFICIENT');
        }

        // 組織未認証（gpt-image-1 / gpt-image-2 は組織のVerificationが必須）
        const isOrgVerification =
          response.status === 403 ||
          /verification|verify.*organi[sz]ation|must be verified/i.test(errMsg);
        if (isOrgVerification) {
          throw new Error('OPENAI_ORG_NOT_VERIFIED');
        }

        throw new Error(`OpenAI API Error: ${response.status} - ${errMsg || response.statusText}`);
      }

      const data = await response.json();
      console.log(`OpenAI API success (model=${modelName})`);

      if (data.data && data.data.length > 0) {
        const item = data.data[0];
        if (item.url) return item.url;
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
      }
      throw new Error('OpenAIからの画像生成に失敗しました（レスポンス形式が想定外）');

    } catch (error) {
      // ネットワークエラー(TypeError)で最後の候補なら詳細メッセージを残す
      if (error.name === 'AbortError') throw error;
      console.error(`OpenAI request failed (model=${modelName}):`, error);
      lastError = error;
      // エラーが「フォールバック対象でない」場合は即座に投げる
      const isFallbackable = error.message && /OpenAI API Error: 4\d\d/.test(error.message) && modelName !== modelCandidates[modelCandidates.length - 1];
      if (!isFallbackable) throw error;
    }
  }
  throw lastError || new Error('OpenAIからの画像生成に失敗しました');
}

// 結果をポーリングで取得（app.jsの実装を参考）
async function pollForResult(requestId, statusUrl, resultUrl, abortSignal = null) {
  console.log(`FAL AIキューからの結果取得を開始: request_id: ${requestId}`);

  const maxRetries = 60; // 最大60回（5秒 × 60 = 5分）
  const retryInterval = 5000; // 5秒ごと

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // キャンセルチェック
      if (abortSignal && abortSignal.aborted) {
        throw new DOMException('キャンセルされました', 'AbortError');
      }

      // 5秒待機（キャンセル時は即時中断）
      await new Promise(function(resolve, reject) {
        var tid = setTimeout(resolve, retryInterval);
        if (abortSignal) {
          abortSignal.addEventListener('abort', function() {
            clearTimeout(tid);
            reject(new DOMException('キャンセルされました', 'AbortError'));
          }, { once: true });
        }
      });

      // 待機後もキャンセルチェック
      if (abortSignal && abortSignal.aborted) {
        throw new DOMException('キャンセルされました', 'AbortError');
      }

      console.log(`ステータス確認 (試行 ${attempt + 1}/${maxRetries}): ${statusUrl}`);

      // ステータスをチェック
      const statusFetchOptions = {
        headers: {
          'Authorization': `Key ${falApiKey}`
        }
      };

      // AbortSignalを追加
      if (abortSignal) {
        statusFetchOptions.signal = abortSignal;
      }

      const statusResponse = await fetch(statusUrl, statusFetchOptions);

      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }

      const statusData = await statusResponse.json();
      console.log('Status check response:', {
        status: statusData.status,
        hasImages: !!(statusData.images && statusData.images.length > 0),
        attempt: attempt + 1
      });

      // COMPLETEDの場合
      if (statusData.status === 'COMPLETED') {
        // まずstatusDataにimagesがあるか確認
        if (statusData.images && statusData.images.length > 0) {
          console.log('✓ Result found in status response, returning directly');
          return statusData;
        }

        // statusDataにimagesがない場合、resultUrlから取得
        console.log('Fetching result from:', resultUrl);
        try {
          const resultFetchOptions = {
            headers: {
              'Authorization': `Key ${falApiKey}`
            }
          };

          // AbortSignalを追加
          if (abortSignal) {
            resultFetchOptions.signal = abortSignal;
          }

          const resultResponse = await fetch(resultUrl, resultFetchOptions);

          console.log('Result fetch response status:', resultResponse.status);

          if (!resultResponse.ok) {
            console.warn(`⚠ Result fetch failed with status ${resultResponse.status}`);
            // result取得失敗でもstatusDataがあれば使用
            if (statusData) {
              console.log('Using statusData as fallback (response not ok)');
              return statusData;
            }
            throw new Error(`Result fetch failed: ${resultResponse.status}`);
          }

          const result = await resultResponse.json();
          console.log('✓ Result fetched successfully:', {
            hasImages: !!(result.images && result.images.length > 0),
            hasData: !!(result.data)
          });
          return result;
        } catch (resultError) {
          console.error('✗ Result fetch error:', resultError);
          // result取得エラーでもstatusDataがあれば使用
          if (statusData) {
            console.log('Using statusData as fallback (error caught)');
            return statusData;
          }
          throw resultError;
        }
      } else if (statusData.status === 'FAILED') {
        const errMsg = statusData.error || '';
        const isBalanceFailed = ['balance', 'credit', 'payment', 'insufficient'].some(function(kw) {
          return errMsg.toLowerCase().indexOf(kw) !== -1;
        });
        if (isBalanceFailed) {
          throw new Error('FAL_BALANCE_INSUFFICIENT');
        }
        throw new Error(errMsg || '画像生成に失敗しました');
      }

      // 進捗表示（ログがある場合）
      if (statusData.logs && statusData.logs.length > 0) {
        const lastLog = statusData.logs[statusData.logs.length - 1];
        console.log(`生成中: ${lastLog.message || '処理中...'}`);
      }

    } catch (error) {
      // AbortErrorは即座に再スロー（キャンセル処理）
      if (error.name === 'AbortError') {
        throw error;
      }
      // その他エラーは最後の試行でない場合は再試行
      if (attempt < maxRetries - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('タイムアウト: 画像生成に時間がかかりすぎています');
}

// 画像をダウンロード
async function downloadImage(imageUrl, style) {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `design-${style}-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showToast('画像をダウンロードしました');
  } catch (error) {
    console.error('Download error:', error);
    showToast('ダウンロードに失敗しました: ' + error.message);
  }
}

// 画像をクリップボードにコピー
async function copyImageToClipboard(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    // PNGに変換してコピー
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    canvas.toBlob(async (pngBlob) => {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob
        })
      ]);
      showToast('クリップボードにコピーしました');
    }, 'image/png');

  } catch (error) {
    console.error('Clipboard copy error:', error);
    showToast('クリップボードへのコピーに失敗しました: ' + error.message);
  }
}

// 画像アップロード機能の初期化
function setupImageUpload() {
  // キャラクター画像
  const characterZone = document.getElementById('characterImageZone');
  const characterInput = document.getElementById('characterImageInput');
  const characterPreview = document.getElementById('characterPreview');
  const removeCharacterBtn = document.getElementById('removeCharacterBtn');

  // デザイン参考画像
  const designZone = document.getElementById('designImageZone');
  const designInput = document.getElementById('designImageInput');
  const designPreview = document.getElementById('designPreview');
  const removeDesignBtn = document.getElementById('removeDesignBtn');

  // キャラクター画像のイベント設定
  if (characterZone) {
    setupImageUploadZone(characterZone, characterInput, characterPreview, removeCharacterBtn, 'character');
  }

  // デザイン参考画像のイベント設定
  if (designZone) {
    setupImageUploadZone(designZone, designInput, designPreview, removeDesignBtn, 'design');
  }
}

// 画像アップロードゾーンのイベント設定
function setupImageUploadZone(zone, input, preview, removeBtn, type) {
  // クリックでファイル選択
  zone.addEventListener('click', (e) => {
    if (e.target === removeBtn) return;
    input.click();
  });

  // ファイル選択時の処理
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleImageFile(file, preview, removeBtn, zone, type);
    }
  });

  // ドラッグオーバー時のスタイル変更
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
  });

  // ドロップ時の処理
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageFile(file, preview, removeBtn, zone, type);
    } else {
      showToast('画像ファイルをドロップしてください');
    }
  });

  // 削除ボタンのイベント
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeImage(preview, removeBtn, zone, type);
  });
}

// 画像ファイルの処理
async function handleImageFile(file, preview, removeBtn, zone, type) {
  // ファイルサイズチェック（10MB以下）
  if (file.size > 10 * 1024 * 1024) {
    showToast('画像サイズは10MB以下にしてください');
    return;
  }

  try {
    // 画像をリサイズしてBase64に変換（最大800x800、品質85%）
    const resizedBase64 = await resizeImageToBase64(file, 800, 800, 0.85);

    // プレビュー表示
    preview.src = resizedBase64;
    preview.style.display = 'block';
    removeBtn.style.display = 'block';

    // placeholderを非表示
    const placeholder = zone.querySelector('.upload-placeholder');
    if (placeholder) {
      placeholder.style.display = 'none';
    }

    // Base64データを保存
    if (type === 'character') {
      characterImageBase64 = resizedBase64;
    } else if (type === 'design') {
      designImageBase64 = resizedBase64;
    }

    showToast(`${type === 'character' ? 'キャラクター' : 'デザイン参考'}画像をアップロードしました（リサイズ済み）`);
  } catch (error) {
    console.error('画像の処理に失敗:', error);
    showToast('画像の読み込みに失敗しました');
  }
}

// 画像の削除
function removeImage(preview, removeBtn, zone, type) {
  preview.style.display = 'none';
  preview.src = '';
  removeBtn.style.display = 'none';

  // placeholderを表示
  const placeholder = zone.querySelector('.upload-placeholder');
  if (placeholder) {
    placeholder.style.display = 'block';
  }

  // Base64データをクリア
  if (type === 'character') {
    characterImageBase64 = null;
  } else if (type === 'design') {
    designImageBase64 = null;
  }

  // input要素をリセット
  const input = zone.querySelector('input[type="file"]');
  if (input) {
    input.value = '';
  }

  showToast(`${type === 'character' ? 'キャラクター' : 'デザイン参考'}画像を削除しました`);
}

// 画像をリサイズしてBase64に変換
async function resizeImageToBase64(file, maxWidth = 500, maxHeight = 500, quality = 0.75, format = 'image/webp') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        // 元の画像サイズ
        let width = img.width;
        let height = img.height;

        // アスペクト比を保ったままリサイズ
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }

        // Canvasで描画
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Base64に変換（WebP形式）
        const resizedBase64 = canvas.toDataURL(format, quality);
        resolve(resizedBase64);
      };

      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
}

// Base64データURIをBlobに変換
function base64ToBlob(base64Data) {
  const parts = base64Data.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

// 画像URLをBase64 data URIに変換
async function convertImageToBase64(imagePath) {
  try {
    console.log('画像を読み込み中:', imagePath);
    const response = await fetch(imagePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    console.log(`画像読み込み完了 (size: ${blob.size} bytes, type: ${blob.type})`);

    // BlobをBase64に変換
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        console.log('Base64変換完了');
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('画像の変換に失敗しました:', error);
    throw error;
  }
}

// FAL CDNに画像をアップロード（Base64 data URIから）
async function uploadToFalCDN(base64DataUri, filename) {
  console.log(`FAL CDNへのアップロード開始: ${filename}`);

  try {
    // Base64 data URIからBlobに変換
    const blob = base64ToBlob(base64DataUri);
    const mimeType = blob.type;
    console.log(`Blob作成完了 (size: ${blob.size} bytes, type: ${mimeType})`);

    // Step 1: 2段階アップロード方式を試行
    const initiateEndpoints = [
      'https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3',
      'https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn',
      'https://rest.alpha.fal.ai/storage/upload/initiate'
    ];

    for (const endpoint of initiateEndpoints) {
      try {
        console.log(`Initiate試行中: ${endpoint}`);

        // 2-1. Initiate request
        const initiateRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Key ${falApiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            content_type: mimeType,
            file_name: filename
          })
        });

        if (!initiateRes.ok) {
          console.warn(`Initiate失敗 (${initiateRes.status}): ${endpoint}`);
          continue;
        }

        const data = await initiateRes.json();
        const uploadUrl = data.upload_url || data.uploadUrl;
        const fileUrl = data.file_url || data.fileUrl || data.url;

        if (!uploadUrl || !fileUrl) {
          console.warn('Upload URLまたはFile URLが取得できませんでした');
          continue;
        }

        console.log(`Initiate成功! File URL: ${fileUrl}`);

        // 2-2. Upload (PUT request)
        console.log(`実際のアップロード中: ${uploadUrl}`);
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: blob
        });

        if (!uploadRes.ok) {
          console.warn(`Upload失敗 (${uploadRes.status})`);
          continue;
        }

        // 成功！
        console.log(`✓ FAL CDNアップロード成功: ${fileUrl}`);
        return { url: fileUrl, error: null };

      } catch (err) {
        console.warn(`Initiate/Upload失敗: ${endpoint}`, err);
        continue;
      }
    }

    // Step 2: フォールバック - FormData方式
    console.log('2段階アップロード失敗、FormData方式を試行');
    const legacyEndpoints = [
      'https://api.fal.ai/v1/storage/upload',
      'https://api.fal.run/v1/storage/upload',
      'https://fal.run/api/v1/storage/upload',
      'https://fal.ai/api/v1/storage/upload'
    ];

    for (const endpoint of legacyEndpoints) {
      try {
        console.log(`FormDataアップロード試行中: ${endpoint}`);

        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('content_type', mimeType);
        formData.append('filename', filename);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': `Key ${falApiKey}` },
          body: formData
        });

        if (!response.ok) {
          console.warn(`FormDataアップロード失敗 (${response.status}): ${endpoint}`);
          continue;
        }

        const data = await response.json();
        const url = data.url || data.file_url || data.fileUrl;

        if (url) {
          console.log(`✓ FormDataアップロード成功: ${url}`);
          return { url, error: null };
        }

      } catch (err) {
        console.warn(`FormDataアップロード失敗: ${endpoint}`, err);
        continue;
      }
    }

    // 全て失敗
    console.error('✗ 全てのアップロード方式が失敗しました');
    return { url: '', error: new Error('All upload attempts failed') };

  } catch (error) {
    console.error('✗ アップロード処理でエラーが発生:', error);
    return { url: '', error };
  }
}

// Base64画像をFAL AIにアップロード
async function uploadBase64ToFal(base64Data, imageType) {
  try {
    console.log(`${imageType}画像のアップロード開始`);
    // Base64をBlobに変換
    const blob = base64ToBlob(base64Data);
    console.log(`Blob作成完了 (size: ${blob.size} bytes, type: ${blob.type})`);

    // FormDataを作成
    const formData = new FormData();
    formData.append('file', blob, `${imageType}.jpg`);

    console.log('FAL AIストレージAPIにアップロード中...');
    // FAL AIのストレージAPIにアップロード
    const response = await fetch('https://fal.run/storage/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falApiKey}`
      },
      body: formData
    });

    console.log(`アップロードレスポンス status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('アップロードエラー:', errorText);
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`${imageType} image uploaded successfully:`, data);

    // FAL AIのレスポンス形式に応じてURLを取得
    return data.url || data.file_url || data.access_url;
  } catch (error) {
    console.error(`Failed to upload ${imageType} image:`, error);
    throw error;
  }
}

// ローカル画像パスからBlobを取得してFAL AIにアップロード
async function uploadImageToFal(imagePath, imageType) {
  try {
    console.log(`${imageType}画像をローカルから読み込み中: ${imagePath}`);
    // 画像をfetchで取得
    const response = await fetch(imagePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    console.log(`Blob作成完了 (size: ${blob.size} bytes, type: ${blob.type})`);

    // FormDataを作成
    const formData = new FormData();
    formData.append('file', blob, `${imageType}.jpg`);

    console.log('FAL AIストレージAPIにアップロード中...');
    // FAL AIのストレージAPIにアップロード
    const uploadResponse = await fetch('https://fal.run/api/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falApiKey}`
      },
      body: formData
    });

    console.log(`アップロードレスポンス status: ${uploadResponse.status}`);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('アップロードエラー:', errorText);
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const data = await uploadResponse.json();
    console.log(`${imageType} image uploaded successfully:`, data);

    // FAL AIのレスポンス形式に応じてURLを取得
    return data.url || data.file_url || data.access_url;
  } catch (error) {
    console.error(`Failed to upload ${imageType} image:`, error);
    throw error;
  }
}


// ===========================
// ストレージ使用量管理
// ===========================

// ストレージ使用量を計算して表示
async function updateStorageUsage() {
  try {
    // window.browserStorageの使用量を取得（バイト単位）
    window.browserStorage.getBytesInUse(null, (bytesInUse) => {
      const STORAGE_LIMIT = 10 * 1024 * 1024; // 10MB
      const usedMB = (bytesInUse / 1024 / 1024).toFixed(2);
      const usagePercent = ((bytesInUse / STORAGE_LIMIT) * 100).toFixed(1);

      const storageText = document.getElementById('storageUsageText');
      if (storageText) {
        storageText.textContent = `ストレージ使用量: ${usedMB}MB / 10MB (${usagePercent}%)`;

        // 使用率に応じて色を変更
        if (usagePercent >= 90) {
          storageText.style.color = '#e74c3c'; // 赤
          storageText.style.fontWeight = 'bold';
        } else if (usagePercent >= 70) {
          storageText.style.color = '#f39c12'; // オレンジ
        } else {
          storageText.style.color = '#27ae60'; // 緑
        }
      }
    });
  } catch (error) {
    console.error('Failed to get storage usage:', error);
  }
}

// ===========================
// 画像ライブラリ管理
// ===========================

// 画像ライブラリをロード
async function loadImageLibrary() {
  try {
    const data = await window.browserStorage.get('imageLibrary');
    imageLibrary = data.imageLibrary || [];
    console.log('Image library loaded:', imageLibrary.length, 'images');
  } catch (error) {
    console.error('Failed to load image library:', error);
    imageLibrary = [];
  }
}

// 画像ライブラリを保存
async function saveImageLibrary() {
  try {
    await window.browserStorage.set({ imageLibrary });
    console.log('Image library saved:', imageLibrary.length, 'images');
  } catch (error) {
    console.error('Failed to save image library:', error);
    showToast('画像の保存に失敗しました');
  }
}

// 画像をライブラリに追加
async function addImageToLibrary(file) {
  try {
    const base64Data = await resizeImageToBase64(file, 800, 800, 0.85);
    const thumbnail = await resizeImageToBase64(file, 200, 200, 0.8);

    const imageData = {
      id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: file.name,
      base64Data: base64Data,
      thumbnail: thumbnail,
      uploadDate: new Date().toISOString()
    };

    imageLibrary.push(imageData);
    await saveImageLibrary();

    showToast('画像「' + file.name + '」を追加しました');
    renderLibraryGrid();
  } catch (error) {
    console.error('Failed to add image to library:', error);
    showToast('画像の追加に失敗しました');
  }
}

// ライブラリから画像を削除
async function removeImageFromLibrary(imageId) {
  const index = imageLibrary.findIndex(img => img.id === imageId);
  if (index !== -1) {
    const imageName = imageLibrary[index].name;
    imageLibrary.splice(index, 1);
    await saveImageLibrary();
    showToast('画像「' + imageName + '」を削除しました');
    renderLibraryGrid();
  }
}

// 画像ライブラリグリッドを描画
function renderLibraryGrid() {
  const libraryGrid = document.getElementById('libraryGrid');
  const libraryEmpty = document.getElementById('libraryEmpty');

  if (imageLibrary.length === 0) {
    libraryGrid.style.display = 'none';
    libraryEmpty.style.display = 'block';
    return;
  }

  libraryGrid.style.display = 'grid';
  libraryEmpty.style.display = 'none';
  libraryGrid.innerHTML = '';

  imageLibrary.forEach(image => {
    const item = document.createElement('div');
    item.className = 'library-image-item';
    item.innerHTML = '<img src="' + image.thumbnail + '" alt="' + image.name + '"><button class="library-image-delete" data-id="' + image.id + '">×</button>';

    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('library-image-delete')) {
        selectImageFromLibrary(image);
      }
    });

    const deleteBtn = item.querySelector('.library-image-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('画像「' + image.name + '」を削除しますか？')) {
        removeImageFromLibrary(image.id);
      }
    });

    libraryGrid.appendChild(item);
  });
}

// ライブラリから画像を選択
function selectImageFromLibrary(image) {
  if (currentLibraryTarget === 'character') {
    characterImageBase64 = image.base64Data;
    const preview = document.getElementById('characterPreview');
    const placeholder = document.getElementById('characterImageZone').querySelector('.upload-placeholder');
    const removeBtn = document.getElementById('removeCharacterBtn');

    preview.src = image.base64Data;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    removeBtn.style.display = 'block';

    showToast('キャラクター画像に「' + image.name + '」を設定しました');
  } else if (currentLibraryTarget === 'design') {
    designImageBase64 = image.base64Data;
    const preview = document.getElementById('designPreview');
    const placeholder = document.getElementById('designImageZone').querySelector('.upload-placeholder');
    const removeBtn = document.getElementById('removeDesignBtn');

    preview.src = image.base64Data;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    removeBtn.style.display = 'block';

    showToast('デザイン参考画像に「' + image.name + '」を設定しました');
  }

  closeImageLibraryModal();
}

// 画像ライブラリモーダルを開く
function openImageLibraryModal(target) {
  currentLibraryTarget = target;
  const modal = document.getElementById('imageLibraryModal');
  modal.style.display = 'flex';
  renderLibraryGrid();
}

// 画像ライブラリモーダルを閉じる
function closeImageLibraryModal() {
  const modal = document.getElementById('imageLibraryModal');
  modal.style.display = 'none';
  currentLibraryTarget = null;
}

// ファイル選択からアップロード
async function handleLibraryFileSelect(e) {
  const files = Array.from(e.target.files);
  for (const file of files) {
    await addImageToLibrary(file);
  }
  e.target.value = '';
}

// ドラッグ&ドロップでアップロード
function handleLibraryDrop(e) {
  e.preventDefault();
  const uploadArea = document.getElementById('libraryUploadArea');
  uploadArea.classList.remove('dragover');

  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  files.forEach(file => addImageToLibrary(file));
}

function handleLibraryDragOver(e) {
  e.preventDefault();
  const uploadArea = document.getElementById('libraryUploadArea');
  uploadArea.classList.add('dragover');
}

function handleLibraryDragLeave(e) {
  const uploadArea = document.getElementById('libraryUploadArea');
  uploadArea.classList.remove('dragover');
}

// ===========================
// 画像ライブラリイベントリスナー初期化
// ===========================

async function initImageLibrary() {
  await loadImageLibrary();

  const openCharacterBtn = document.getElementById('openCharacterLibraryBtn');
  const openDesignBtn = document.getElementById('openDesignLibraryBtn');
  const closeLibraryBtn = document.querySelector('.close-library');
  const selectFileBtn = document.getElementById('librarySelectFileBtn');
  const fileInput = document.getElementById('libraryFileInput');
  const uploadArea = document.getElementById('libraryUploadArea');
  const modal = document.getElementById('imageLibraryModal');

  if (openCharacterBtn) {
    openCharacterBtn.addEventListener('click', () => openImageLibraryModal('character'));
  }

  if (openDesignBtn) {
    openDesignBtn.addEventListener('click', () => openImageLibraryModal('design'));
  }

  if (closeLibraryBtn) {
    closeLibraryBtn.addEventListener('click', closeImageLibraryModal);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'imageLibraryModal') {
        closeImageLibraryModal();
      }
    });
  }

  if (selectFileBtn && fileInput) {
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleLibraryFileSelect);
  }

  if (uploadArea) {
    uploadArea.addEventListener('drop', handleLibraryDrop);
    uploadArea.addEventListener('dragover', handleLibraryDragOver);
    uploadArea.addEventListener('dragleave', handleLibraryDragLeave);
  }
}

// ===========================
// Source Code Protection
// ===========================

// Prevent right-click context menu
document.addEventListener('contextmenu', function (e) {
  e.preventDefault();
});

// Prevent specific keyboard shortcuts (F12, Ctrl+Shift+I, Ctrl+U, etc.)
document.addEventListener('keydown', function (e) {
  // F12 key
  if (e.key === 'F12' || e.keyCode === 123) {
    e.preventDefault();
    return false;
  }

  // Ctrl and Cmd key combinations
  if (e.ctrlKey || e.metaKey) {
    // Ctrl+Shift+I or Cmd+Option+I (Developer Tools)
    if (e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+J or Cmd+Option+J (Console)
    if (e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+C or Cmd+Option+C (Inspector)
    if (e.shiftKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) {
      e.preventDefault();
      return false;
    }
    // Ctrl+U or Cmd+Option+U (View Source)
    if (e.key === 'U' || e.key === 'u' || e.keyCode === 85) {
      e.preventDefault();
      return false;
    }
    // Ctrl+S or Cmd+S (Save Page)
    if (e.key === 'S' || e.key === 's' || e.keyCode === 83) {
      e.preventDefault();
      return false;
    }
  }
});

// Prevent dragging images
document.addEventListener('dragstart', function (e) {
  if (e.target.tagName.toLowerCase() === 'img') {
    e.preventDefault();
  }
});

// ===== サムネテンプレート生成ツール (モーダル統合版) =====
(function() {
  const ANALYZE_PROMPT = `You are an expert thumbnail/banner design analyst for an AI image generation system called ClickDesign.

Analyze the uploaded thumbnail image and produce a structured YAML-style prompt that can reproduce a similar design.

Your output must be a JSON object with these fields:
- "name": A short descriptive Japanese name for this design style (e.g. "YouTube解説サムネ", "セミナー告知バナー")
- "aspectRatio": Detect the aspect ratio. Choose the closest from: 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16
- "useImageToImage": true if the design heavily relies on photographic elements that should be preserved, false if it's primarily graphic/text-based
- "prompt": A detailed YAML-style prompt string for reproducing this design. The prompt MUST follow this structure:

version: "1.0"
template_name: "(English name for the template)"

canvas_settings:
  aspect_ratio: "(detected ratio)"
  resolution: "(appropriate resolution)"
  color_theme: "(list primary colors used)"

layout_skeleton:
  background:
    style: "(describe background: gradients, patterns, solid colors, photo overlays)"
    primary_color: "(hex)"
    secondary_color: "(hex)"
  main_visual:
    position: "(describe position and size)"
    style: "(describe the main visual element: photo cutout, illustration, icon, etc.)"
  text_areas:
    headline:
      position: "(where the main title goes)"
      style: "(font style: bold, outlined, shadowed, etc.)"
      color: "(hex)"
      size: "(relative: large, medium, small)"
    subheadline:
      position: "(where subtitle/subtext goes)"
      style: "(font style)"
      color: "(hex)"
  decorative_elements:
    - type: "(shapes, lines, badges, ribbons, etc.)"
      position: "(where)"
      color: "(hex)"
      style: "(describe)"

design_instructions:
  overall_mood: "(professional, energetic, calm, urgent, etc.)"
  typography_notes: "(Japanese font recommendations, weight, spacing)"
  composition_notes: "(key composition rules for this layout)"

IMPORTANT:
- Be extremely detailed and specific about colors (use hex codes), positions, sizes, and styles
- The prompt should be detailed enough that an AI image generator can reproduce a very similar design
- All text in the prompt should describe the TEMPLATE/LAYOUT, not the specific content
- Use placeholders like {title}, {subtitle}, {name} for text content areas
- Focus on the visual structure, not the actual text content shown

Return ONLY a valid JSON object, no markdown fences.`;

  const ASPECT_RATIOS = ['16:9', '5:2', '21:9', '1:1', '9:16', '4:3', '3:4'];

  // 内部state
  let tgtTemplates = [];
  let tgtIsAnalyzing = false;

  // DOM取得ヘルパー
  const $ = id => document.getElementById(id);

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: file.type, dataUrl });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // モーダル開閉
  window.openThumbGenToolModal = function() {
    const modal = $('thumbGenToolModal');
    if (modal) modal.classList.add('show');
  };

  function closeThumbGenToolModal() {
    const modal = $('thumbGenToolModal');
    if (modal) modal.classList.remove('show');
  }

  // フレームワークトグル
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('#tgtFrameworkToggle');
    if (toggle) {
      const body = $('tgtFrameworkBody');
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      toggle.classList.toggle('open', isHidden);
    }
  });

  // 閉じるボタン
  document.addEventListener('click', (e) => {
    if (e.target.closest('.close-thumb-gen-tool')) {
      closeThumbGenToolModal();
    }
    // オーバーレイクリック
    if (e.target === $('thumbGenToolModal')) {
      closeThumbGenToolModal();
    }
  });

  // ドラッグ＆ドロップ
  document.addEventListener('dragover', (e) => {
    const zone = e.target.closest('#tgtUploadZone');
    if (zone) {
      e.preventDefault();
      zone.classList.add('dragging');
    }
  });
  document.addEventListener('dragleave', (e) => {
    const zone = e.target.closest('#tgtUploadZone');
    if (zone) zone.classList.remove('dragging');
  });
  document.addEventListener('drop', (e) => {
    const zone = e.target.closest('#tgtUploadZone');
    if (zone) {
      e.preventDefault();
      zone.classList.remove('dragging');
      if (!tgtIsAnalyzing) {
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length) handleTgtImages(files);
      }
    }
  });

  // ファイル選択ボタン
  document.addEventListener('click', (e) => {
    if (e.target.closest('#tgtSelectFilesBtn')) {
      if (!tgtIsAnalyzing) $('tgtFileInput').click();
    }
    // アップロードゾーン全体のクリック
    if (e.target.closest('#tgtUploadZone') && !e.target.closest('#tgtSelectFilesBtn') && !e.target.closest('.btn')) {
      if (!tgtIsAnalyzing) $('tgtFileInput').click();
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'tgtFileInput') {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      if (files.length) handleTgtImages(files);
      e.target.value = '';
    }
  });

  // Claude API呼び出し
  async function callClaudeAnalysis(base64, mimeType) {
    if (!thumbGenApiKey) {
      throw new Error('APIキーが設定されていません。歯車アイコンからClaude APIキーを設定してください。');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': thumbGenApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: base64 } },
            { type: 'text', text: ANALYZE_PROMPT }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude応答のJSON解析に失敗しました');
    return JSON.parse(match[0]);
  }

  // 画像解析メインハンドラ
  async function handleTgtImages(files) {
    if (!thumbGenApiKey) {
      // API設定モーダルを開く
      const thumbGenApiModal = $('thumbGenApiModal');
      if (thumbGenApiModal) thumbGenApiModal.classList.add('show');
      showToast('先にClaude APIキーを設定してください');
      return;
    }

    tgtIsAnalyzing = true;
    $('tgtUploadZone').classList.add('disabled');
    $('tgtProgress').style.display = 'flex';
    $('tgtError').style.display = 'none';

    const startIndex = tgtTemplates.length;

    for (let i = 0; i < files.length; i++) {
      $('tgtProgressText').textContent = `解析中... ${i + 1} / ${files.length}`;
      try {
        const { base64, mimeType, dataUrl } = await fileToBase64(files[i]);
        const id = `banner${String(startIndex + i + 1).padStart(3, '0')}`;

        const result = await callClaudeAnalysis(base64, mimeType);

        tgtTemplates.push({
          id,
          name: result.name || 'カスタムデザイン',
          aspectRatio: result.aspectRatio || '16:9',
          useImageToImage: result.useImageToImage || false,
          imageBase64: base64,
          dataUrl: dataUrl,
          fileName: files[i].name
        });
      } catch (err) {
        console.error(`File ${files[i].name} failed:`, err);
        $('tgtError').textContent = `${files[i].name} の解析に失敗: ${err.message}`;
        $('tgtError').style.display = 'block';
      }
    }

    tgtIsAnalyzing = false;
    $('tgtUploadZone').classList.remove('disabled');
    $('tgtProgress').style.display = 'none';

    renderTgtResults();
  }

  // 結果レンダリング
  function renderTgtResults() {
    const grid = $('tgtResultsGrid');
    const section = $('tgtResultsSection');

    if (tgtTemplates.length === 0) {
      section.style.display = 'none';
      grid.innerHTML = '';
      return;
    }

    section.style.display = 'block';

    grid.innerHTML = tgtTemplates.map((tmpl, i) => `
      <div class="tgt-card" data-index="${i}">
        <div class="tgt-card-header">
          <div class="tgt-card-header-left">
            <span class="tgt-card-id">${tmpl.id}</span>
            <input class="tgt-card-name" value="${escapeHtml(tmpl.name)}" data-field="name" data-index="${i}">
          </div>
          <button class="tgt-card-remove" data-remove="${i}" title="削除">&times;</button>
        </div>
        <div class="tgt-card-thumb">
          <img src="${tmpl.dataUrl}" alt="${escapeHtml(tmpl.name)}">
        </div>
        <div class="tgt-card-settings" style="padding: 10px 12px 12px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 0.72rem; color: #94a3b8; font-weight: 600;">アスペクト比:</span>
            <select data-field="aspectRatio" data-index="${i}" style="flex:1; padding: 6px 28px 6px 10px; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; font-size: 0.82rem; background: rgba(99,102,241,0.15); color: #c7d2fe; cursor: pointer; appearance: none; -webkit-appearance: none; background-image: url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 fill=%27%2394a3b8%27 viewBox=%270 0 16 16%27%3E%3Cpath d=%27M8 11L3 6h10z%27/%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: right 8px center;">
              ${ASPECT_RATIOS.map(r => `<option value="${r}"${r === tmpl.aspectRatio ? ' selected' : ''} style="background:#1e293b;color:#e2e8f0;">${r}</option>`).join('')}
            </select>
          </div>
          <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #94a3b8; font-weight: 600; cursor: pointer;">
            <input type="checkbox" data-field="useImageToImage" data-index="${i}"${tmpl.useImageToImage ? ' checked' : ''} style="margin: 0;">
            Image-to-Image
          </label>
        </div>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // 結果の編集イベント（イベント委譲）
  document.addEventListener('input', (e) => {
    const idx = e.target.dataset?.index;
    const field = e.target.dataset?.field;
    if (idx === undefined || field === undefined) return;
    if (!e.target.closest('#tgtResultsGrid')) return;

    const i = parseInt(idx);
    if (i >= 0 && i < tgtTemplates.length) {
      if (field === 'useImageToImage') {
        tgtTemplates[i][field] = e.target.checked;
      } else {
        tgtTemplates[i][field] = e.target.value;
      }
    }
  });

  document.addEventListener('change', (e) => {
    const idx = e.target.dataset?.index;
    const field = e.target.dataset?.field;
    if (idx === undefined || field === undefined) return;
    if (!e.target.closest('#tgtResultsGrid')) return;

    const i = parseInt(idx);
    if (i >= 0 && i < tgtTemplates.length) {
      if (field === 'useImageToImage') {
        tgtTemplates[i][field] = e.target.checked;
      } else {
        tgtTemplates[i][field] = e.target.value;
      }
    }
  });

  // カード削除
  document.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn && removeBtn.closest('#tgtResultsGrid')) {
      const i = parseInt(removeBtn.dataset.remove);
      tgtTemplates.splice(i, 1);
      // IDを振り直す
      tgtTemplates.forEach((t, idx) => { t.id = `banner${String(idx + 1).padStart(3, '0')}`; });
      renderTgtResults();
    }
  });

  // クリアボタン
  document.addEventListener('click', (e) => {
    if (e.target.closest('#tgtClearBtn')) {
      tgtTemplates = [];
      $('tgtError').style.display = 'none';
      renderTgtResults();
    }
  });

  // ZIPダウンロード
  document.addEventListener('click', async (e) => {
    if (e.target.closest('#tgtDownloadBtn')) {
      if (tgtTemplates.length === 0) return;
      const groupName = $('tgtGroupName').value.trim() || 'カスタムサムネテンプレート';

      try {
        const zip = new JSZip();
        const imagesFolder = zip.folder('images');
        const pack = { name: groupName, designs: [] };

        for (const tmpl of tgtTemplates) {
          const ext = tmpl.fileName.split('.').pop() || 'jpg';
          const imageFileName = `${tmpl.id}.${ext}`;
          imagesFolder.file(imageFileName, tmpl.imageBase64, { base64: true });
          pack.designs.push({
            id: tmpl.id,
            name: tmpl.name,
            aspectRatio: tmpl.aspectRatio,
            sampleImage: `images/${imageFileName}`,
            useImageToImage: tmpl.useImageToImage
          });
        }

        zip.file('design.json', JSON.stringify(pack, null, 2));
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${groupName.replace(/\s+/g, '-')}-template-pack.zip`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('ZIPをダウンロードしました');
      } catch (err) {
        showToast('ZIPの生成に失敗しました: ' + err.message);
      }
    }
  });

  // ClickDesignに直接インポート
  document.addEventListener('click', async (e) => {
    if (e.target.closest('#tgtImportBtn')) {
      if (tgtTemplates.length === 0) return;
      const groupName = $('tgtGroupName').value.trim() || 'カスタムサムネテンプレート';

      try {
        // ZIPを内部生成してprocessZipFileに渡す
        const zip = new JSZip();
        const imagesFolder = zip.folder('images');
        const pack = { name: groupName, designs: [] };

        for (const tmpl of tgtTemplates) {
          const ext = tmpl.fileName.split('.').pop() || 'jpg';
          const imageFileName = `${tmpl.id}.${ext}`;
          imagesFolder.file(imageFileName, tmpl.imageBase64, { base64: true });
          pack.designs.push({
            id: tmpl.id,
            name: tmpl.name,
            aspectRatio: tmpl.aspectRatio,
            sampleImage: `images/${imageFileName}`,
            useImageToImage: tmpl.useImageToImage
          });
        }

        zip.file('design.json', JSON.stringify(pack, null, 2));
        const blob = await zip.generateAsync({ type: 'blob' });

        // 既存のprocessZipFileを利用してインポート
        const newGroup = await processZipFile(blob);
        if (newGroup) {
          designGroups.push(newGroup);
          await saveDesignGroups();
          renderDesignGroups();
          showToast(`「${newGroup.name}」をインポートしました`);
          switchTab(newGroup.id);
          closeThumbGenToolModal();

          // 生成結果をクリア
          tgtTemplates = [];
          renderTgtResults();
        }
      } catch (err) {
        showToast('インポートに失敗しました: ' + err.message);
        console.error('Direct import error:', err);
      }
    }
  });

})();

