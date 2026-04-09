# タブごとの保存ボタンと永続化信頼性向上 - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 各タブに「保存」ボタンを追加し、ストレージを `chrome.storage.local → IndexedDB → localStorage` の多段フォールバック方式に移行して、インポートしたテンプレートがツール再起動後に消える問題を根本的に解決する。

**Architecture:**
既存の `window.browserStorage` のインターフェース（`get/set/remove/getBytesInUse`）は維持したまま、内部実装だけをバックエンド差し替え可能な構造にリファクタする。起動時に利用可能な最優先バックエンドを1回だけ判定してキャッシュ。エラーは握りつぶさず呼び出し側まで propagate させる。保存ボタンは `renderDesignGroups` で各タブペインの先頭に注入し、クリックハンドラはイベント委譲で一度だけ設定する。

**Tech Stack:** Chrome拡張機能 Manifest V3 / Vanilla JavaScript / `chrome.storage.local` / IndexedDB (native, no library) / localStorage / CSS変数ベースのダークテーマ

**Spec:** `docs/superpowers/specs/2026-04-09-per-tab-save-button-design.md`

**Testing:** このプロジェクトは自動テストフレームワークを持たないChrome拡張機能です。各タスクの検証は、Chrome DevToolsを使った手動スモークテストで行います。

---

## File Structure

変更するファイルと責務：

| ファイル | 役割 | 変更種別 |
|---------|------|---------|
| `manifest.json` | 拡張機能のpermissions定義 | 1行追加 |
| `app.js:55-146` | `window.browserStorage` 実装 | バックエンド層を全面リファクタ |
| `app.js:308-374` | `loadDesignGroups` / `saveDesignGroups` | マイグレーション処理とエラー通知強化 |
| `app.js:612-632` | `addDesignGroup` | await不足の修正 |
| `app.js:400-486` | `renderDesignGroups` | タブペイン先頭に保存ボタンのHTML注入 |
| `app.js:491-569` | `setupEventListeners`/`setupTabListeners` | 保存ボタンのクリックハンドラ追加 |
| `styles.css` | 末尾に保存ボタンのスタイル追加 | 追加のみ |

---

## Task 1: manifest.json に unlimitedStorage 権限を追加

**Files:**
- Modify: `manifest.json:6-12`

- [ ] **Step 1.1: manifest.jsonを開いてpermissions配列を確認**

現在のpermissions配列:
```json
"permissions": [
  "activeTab",
  "contextMenus",
  "scripting",
  "storage",
  "notifications"
],
```

- [ ] **Step 1.2: "unlimitedStorage" を追加**

変更後:
```json
"permissions": [
  "activeTab",
  "contextMenus",
  "scripting",
  "storage",
  "unlimitedStorage",
  "notifications"
],
```

- [ ] **Step 1.3: Chrome拡張管理画面で拡張機能をリロードして検証**

手順:
1. Chromeで `chrome://extensions/` を開く
2. 「ClickDesign1.2」の「更新」ボタンまたは「再読み込み」ボタンをクリック
3. エラーが出ないことを確認

期待結果: エラー無しでロードされる。

- [ ] **Step 1.4: コミット**

```bash
git add manifest.json
git commit -m "feat(manifest): add unlimitedStorage permission

chrome.storage.local と IndexedDB の容量制限を撤廃するため
unlimitedStorage 権限を追加する。"
```

---

## Task 2: ストレージバックエンドを多段フォールバック化

**Files:**
- Modify: `app.js:55-146`

このタスクでは `window.browserStorage` の内部実装を完全に差し替える。呼び出し側の API シグネチャは維持するので、他の箇所のコード変更は不要。

- [ ] **Step 2.1: app.js の 55-146 行目（memoryStorageから window.browserStorage の終わり `};` まで）を以下の新しい実装に置き換える**

新しい実装：

```js
// ===========================
// ストレージバックエンド抽象化
// ===========================
//
// 優先順位:
// 1. chrome.storage.local  (Chrome拡張機能API、unlimitedStorage権限で容量大)
// 2. IndexedDB             (chrome APIが無い環境の汎用ストレージ)
// 3. localStorage          (最終フォールバック、5-10MB制限)
// 4. memory (プロセス内)   (全部失敗したときの一時退避)
//
// 呼び出し側から見える API:
//   window.browserStorage.get(key)           -> Promise<{[key]: value}>
//   window.browserStorage.set({key: value})  -> Promise<void>   (失敗時throw)
//   window.browserStorage.remove(key)        -> Promise<void>
//   window.browserStorage.getBytesInUse(_, cb) -> number (callback互換)

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

function isChromeStorageAvailable() {
  return typeof chrome !== 'undefined'
      && chrome.storage
      && chrome.storage.local;
}

function isIndexedDBAvailable() {
  return typeof indexedDB !== 'undefined';
}

// バックエンド判定（起動時に1回）
const storageBackend = (() => {
  if (isChromeStorageAvailable()) return 'chrome';
  if (isIndexedDBAvailable()) return 'idb';
  if (isLocalStorageAvailable()) return 'localStorage';
  return 'memory';
})();
console.log('[Storage] Using backend:', storageBackend);

// ---- IndexedDB 薄いラッパー ----
const IDB_NAME = 'clickdesign_storage';
const IDB_STORE = 'kv';
let idbPromise = null;

function openIdb() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
  return idbPromise;
}

async function idbGet(key) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB get failed'));
  });
}

async function idbSet(key, value) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('IndexedDB set failed'));
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
  });
}

async function idbRemove(key) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('IndexedDB remove failed'));
  });
}

async function idbGetAll() {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const result = {};
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        result[cursor.key] = cursor.value;
        cursor.continue();
      } else {
        resolve(result);
      }
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB cursor failed'));
  });
}

// ---- 統一ストレージAPI ----
window.browserStorage = {
  get: async (key) => {
    const keys = typeof key === 'string' ? [key] : (Array.isArray(key) ? key : []);

    if (storageBackend === 'chrome') {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys.length === 1 ? keys[0] : keys, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result || {});
          }
        });
      });
    }

    if (storageBackend === 'idb') {
      const res = {};
      for (const k of keys) {
        const v = await idbGet(k);
        if (v !== undefined) res[k] = v;
      }
      return res;
    }

    if (storageBackend === 'localStorage') {
      const res = {};
      for (const k of keys) {
        try {
          const val = localStorage.getItem(k);
          if (val !== null) res[k] = JSON.parse(val);
        } catch (e) {
          const raw = localStorage.getItem(k);
          if (raw !== null) res[k] = raw;
        }
      }
      return res;
    }

    // memory
    const res = {};
    for (const k of keys) {
      if (memoryStorage[k] !== undefined) {
        try { res[k] = JSON.parse(memoryStorage[k]); }
        catch (e) { res[k] = memoryStorage[k]; }
      }
    }
    return res;
  },

  set: async (items) => {
    if (storageBackend === 'chrome') {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(new Error('chrome.storage.local.set: ' + chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    }

    if (storageBackend === 'idb') {
      for (const [k, v] of Object.entries(items)) {
        await idbSet(k, v);
      }
      return;
    }

    if (storageBackend === 'localStorage') {
      for (const [k, v] of Object.entries(items)) {
        // ここでのエラーは握りつぶさずthrowする
        const stringified = JSON.stringify(v);
        localStorage.setItem(k, stringified);
      }
      return;
    }

    // memory
    for (const [k, v] of Object.entries(items)) {
      memoryStorage[k] = JSON.stringify(v);
    }
  },

  remove: async (key) => {
    const keys = typeof key === 'string' ? [key] : (Array.isArray(key) ? key : []);

    if (storageBackend === 'chrome') {
      return new Promise((resolve, reject) => {
        chrome.storage.local.remove(keys, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    }

    if (storageBackend === 'idb') {
      for (const k of keys) await idbRemove(k);
      return;
    }

    if (storageBackend === 'localStorage') {
      for (const k of keys) localStorage.removeItem(k);
      return;
    }

    for (const k of keys) delete memoryStorage[k];
  },

  getBytesInUse: (param, callback) => {
    // chrome.storage.local は専用APIを持つ
    if (storageBackend === 'chrome' && chrome.storage.local.getBytesInUse) {
      chrome.storage.local.getBytesInUse(null, (bytes) => {
        if (callback) callback(bytes || 0);
      });
      return 0; // 同期戻り値は使わない（呼び出し側はcallbackで受け取る）
    }

    // その他のバックエンドは概算
    let total = 0;
    try {
      if (storageBackend === 'localStorage') {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          const v = localStorage.getItem(k);
          total += (k.length + (v ? v.length : 0)) * 2;
        }
      } else if (storageBackend === 'idb') {
        // IndexedDBの使用量は非同期でないと取れない。callbackで返す
        idbGetAll().then((all) => {
          let t = 0;
          for (const [k, v] of Object.entries(all)) {
            try { t += (k.length + JSON.stringify(v).length) * 2; }
            catch (e) {}
          }
          if (callback) callback(t);
        }).catch(() => { if (callback) callback(0); });
        return 0;
      } else {
        for (const k in memoryStorage) {
          const v = memoryStorage[k];
          total += (k.length + (v ? v.length : 0)) * 2;
        }
      }
    } catch (e) {
      console.warn('getBytesInUse failed:', e);
    }
    if (callback) callback(total);
    return total;
  }
};
```

- [ ] **Step 2.2: 拡張機能をリロードして起動確認**

手順:
1. Chromeで `chrome://extensions/` を開き、ClickDesign1.2を再読み込み
2. 拡張機能アイコンをクリックしてツールを開く
3. DevTools (F12) → Consoleタブを開く
4. `[Storage] Using backend: chrome` のログが出ていることを確認

期待結果: Consoleにバックエンド名が出力される。エラーが出ていないこと。

- [ ] **Step 2.3: 基本動作確認 — 既存のデザイングループが正しく表示されること**

手順:
1. ツールを開いてデザイン選択画面にサムネテンプレ8種のタブが表示されることを確認
2. タブをクリックして中のデザインが表示されることを確認

期待結果: 既存テンプレートが崩れずに表示される。

- [ ] **Step 2.4: chrome.storage.local に書き込めているか確認**

手順:
1. DevToolsのConsoleで以下を実行:
```js
chrome.storage.local.get('designGroups', (r) => console.log(r));
```

期待結果: designGroups配列が返ってくる（空でなければOK）。

- [ ] **Step 2.5: コミット**

```bash
git add app.js
git commit -m "refactor(storage): add multi-tier backend fallback

window.browserStorage の内部実装を chrome.storage.local → IndexedDB
→ localStorage → memory の優先順位で動的選択する方式にリファクタ。
呼び出し側のAPIシグネチャは維持。set失敗時は握りつぶさずthrow
するよう変更。"
```

---

## Task 3: saveDesignGroups のエラー通知強化と addDesignGroup の await 修正

**Files:**
- Modify: `app.js:370-374` (saveDesignGroups)
- Modify: `app.js:612-632` (addDesignGroup)

- [ ] **Step 3.1: saveDesignGroups を修正してエラーを明示表示する**

現在のコード (app.js:370-374):
```js
// デザイングループを保存
async function saveDesignGroups() {
  await window.browserStorage.set({ designGroups: designGroups });
  await updateStorageUsage(); // ストレージ使用量を更新
}
```

以下に置き換える:
```js
// デザイングループを保存
async function saveDesignGroups() {
  try {
    await window.browserStorage.set({ designGroups: designGroups });
    await updateStorageUsage(); // ストレージ使用量を更新
  } catch (err) {
    console.error('[saveDesignGroups] Failed to save:', err);
    const msg = (err && err.message) ? err.message : String(err);
    showToast('⚠️ 保存に失敗しました: ' + msg, 7000);
    throw err; // 呼び出し元が明示保存なら UI 状態更新に使う
  }
}
```

- [ ] **Step 3.2: addDesignGroup の saveDesignGroups 呼び出しに await を付与する**

現在のコード (app.js:612-632):
```js
// デザイングループを追加
function addDesignGroup() {
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
  saveDesignGroups();
  renderDesignGroups();

  // 新しく作成したタブに切り替える
  switchTab(newGroup.id);
}
```

以下に置き換える:
```js
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
    // 保存失敗時はロールバック（トーストはsaveDesignGroups側で表示済み）
    const idx = designGroups.findIndex(g => g.id === newGroup.id);
    if (idx !== -1) designGroups.splice(idx, 1);
    return;
  }
  renderDesignGroups();

  // 新しく作成したタブに切り替える
  switchTab(newGroup.id);
}
```

- [ ] **Step 3.3: 動作確認 — 新規グループ追加と再起動後の残存を確認**

手順:
1. 拡張機能をリロード
2. ツールを開く
3. 「新規グループを追加」ボタンをクリックし、名前を入力（例: `テスト保存確認`）
4. タブが追加されたことを確認
5. ツールのタブを閉じる
6. 拡張機能アイコンから再度ツールを開く
7. 「テスト保存確認」タブが残っていることを確認

期待結果: 再起動後も `テスト保存確認` タブが残っている。

- [ ] **Step 3.4: コミット**

```bash
git add app.js
git commit -m "fix: propagate save errors and await in addDesignGroup

saveDesignGroups のエラーを赤トーストで通知するよう変更し、
addDesignGroup で saveDesignGroups が await されていなかった
問題を修正。保存失敗時はローカル state もロールバック。"
```

---

## Task 4: localStorage からの自動マイグレーション

**Files:**
- Modify: `app.js:308-333` (loadDesignGroups)

既にlocalStorageにデータが残っているユーザーのために、起動時に一度だけ旧データを新バックエンドにコピーする処理を追加する。

- [ ] **Step 4.1: loadDesignGroups にマイグレーション処理を追加する**

現在のコード (app.js:308-333):
```js
// デザイングループを読み込む
async function loadDesignGroups() {
  try {
    const data = await window.browserStorage.get('designGroups');
    if (data.designGroups && Array.isArray(data.designGroups) && data.designGroups.length > 0) {
      designGroups = data.designGroups;
      
      // 移行処理: 旧バージョンの7種データがキャッシュされていれば削除して8種をリロードする
      const oldIndex = designGroups.findIndex(g => g.name === 'サムネテンプレ7種');
      const has8 = designGroups.some(g => g.name === 'サムネテンプレ8種');
      if (oldIndex !== -1 && !has8) {
        designGroups.splice(oldIndex, 1);
        await saveDesignGroups();
        await loadDefaultTemplates();
      }
    } else {
      designGroups = [];
      await loadDefaultTemplates();
    }
  } catch (error) {
    console.error('Failed to load design groups:', error);
    designGroups = [];
    await loadDefaultTemplates();
  }
  renderDesignGroups();
}
```

以下に置き換える:
```js
// 旧localStorageバックエンドから新バックエンドへの1回限りマイグレーション
async function migrateFromLocalStorageIfNeeded() {
  // 現在のバックエンドが localStorage そのものなら移行不要
  if (storageBackend === 'localStorage') return false;

  try {
    const raw = localStorage.getItem('designGroups');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;

    console.log('[Migration] Found legacy designGroups in localStorage, migrating...');
    await window.browserStorage.set({ designGroups: parsed });
    console.log('[Migration] Migrated', parsed.length, 'groups to', storageBackend);
    // 旧データは安全のため削除しない（ロールバック用）
    return true;
  } catch (e) {
    console.warn('[Migration] Failed:', e);
    return false;
  }
}

// デザイングループを読み込む
async function loadDesignGroups() {
  try {
    // 起動時に1回だけ旧localStorageからマイグレーションを試みる
    await migrateFromLocalStorageIfNeeded();

    const data = await window.browserStorage.get('designGroups');
    if (data.designGroups && Array.isArray(data.designGroups) && data.designGroups.length > 0) {
      designGroups = data.designGroups;

      // 移行処理: 旧バージョンの7種データがキャッシュされていれば削除して8種をリロードする
      const oldIndex = designGroups.findIndex(g => g.name === 'サムネテンプレ7種');
      const has8 = designGroups.some(g => g.name === 'サムネテンプレ8種');
      if (oldIndex !== -1 && !has8) {
        designGroups.splice(oldIndex, 1);
        await saveDesignGroups();
        await loadDefaultTemplates();
      }
    } else {
      designGroups = [];
      await loadDefaultTemplates();
    }
  } catch (error) {
    console.error('Failed to load design groups:', error);
    designGroups = [];
    await loadDefaultTemplates();
  }
  renderDesignGroups();
}
```

- [ ] **Step 4.2: マイグレーション動作確認**

手順（マイグレーションが発動するケースを再現）:
1. DevTools Console で以下を実行してlocalStorageにダミーデータを注入:
```js
localStorage.setItem('designGroups', JSON.stringify([
  { id: 'legacy-1', name: '旧データテスト', designs: [] }
]));
```
2. chrome.storage.local の designGroups を一旦クリア:
```js
chrome.storage.local.remove('designGroups', () => console.log('cleared'));
```
3. ツールのタブをリロード（Cmd+R / F5）
4. Consoleに `[Migration] Found legacy designGroups in localStorage, migrating...` が出力されることを確認
5. 「旧データテスト」タブが表示されていることを確認

期待結果: localStorage → chrome.storage.local にデータがコピーされ、タブとして表示される。

- [ ] **Step 4.3: マイグレーションテストデータをクリーンアップ**

```js
localStorage.removeItem('designGroups');
```
その後、ツールタブをリロードして元の状態（サムネテンプレ8種が見える状態）に戻っていることを確認。

- [ ] **Step 4.4: コミット**

```bash
git add app.js
git commit -m "feat(storage): migrate legacy localStorage data on startup

起動時に旧 localStorage の designGroups を新バックエンド
(chrome.storage.local / IndexedDB) に1回だけコピーする。
旧データは安全のためlocalStorageには残したまま。"
```

---

## Task 5: renderDesignGroups に保存ボタンのHTML注入

**Files:**
- Modify: `app.js:408-466` (renderDesignGroups の tabPane 生成部分)

- [ ] **Step 5.1: タブペイン生成部分を更新してヘッダー行を追加する**

現在のコード (app.js:408-466):
```js
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
        // ... (中略、既存のdesign表示ロジック)
      });
    } else {
      styleGrid.innerHTML = '<p style="color:var(--text-dim); grid-column:1/-1; text-align:center;">デザインがありません。</p>';
    }

    tabPane.appendChild(styleGrid);
    tabContent.appendChild(tabPane);
```

以下のように変更する（`styleGrid.appendChild` 行の直前に tabPaneHeader を差し込む）。具体的には `tabPane.appendChild(styleGrid);` の前に以下を追加：

```js
    // タブペインヘッダー（保存ボタン）
    const tabPaneHeader = document.createElement('div');
    tabPaneHeader.className = 'tab-pane-header';
    tabPaneHeader.innerHTML = `
      <button class="tab-save-btn" data-group-id="${group.id}" data-state="idle" title="このタブを保存">
        <span class="tab-save-icon">💾</span>
        <span class="tab-save-label">保存</span>
      </button>
    `;
    tabPane.appendChild(tabPaneHeader);

    tabPane.appendChild(styleGrid);
    tabContent.appendChild(tabPane);
```

**重要**: `tabPane.appendChild(tabPaneHeader);` は必ず `tabPane.appendChild(styleGrid);` より**前**に入れること（ヘッダーがグリッドの上に来るため）。

- [ ] **Step 5.2: 動作確認 — 保存ボタンが各タブに表示される**

手順:
1. 拡張機能をリロード
2. ツールを開く
3. 各タブをクリックし、タブコンテンツの上部に `💾 保存` ボタンが表示されていることを確認
4. ボタンは未スタイル状態（素のHTMLボタン）で表示される段階。見た目が崩れていても次のTask 7で整える

期待結果: 各タブのデザイン一覧の上に保存ボタンが存在する。

- [ ] **Step 5.3: コミット**

```bash
git add app.js
git commit -m "feat(ui): add per-tab save button to tab panes

renderDesignGroups で各タブペインの先頭に
tab-pane-header と tab-save-btn を生成する。
このコミットではHTMLのみ。スタイルとハンドラは後続。"
```

---

## Task 6: 保存ボタンのクリックハンドラを追加

**Files:**
- Modify: `app.js:491-500` (setupTabListeners のイベント委譲部分)

既存の `setupTabListeners` 内の document クリックリスナーは一度しか登録されないので、ここに保存ボタンのハンドリングを追加する。

- [ ] **Step 6.1: setupTabListeners 内のクリックハンドラに保存ボタンの処理を追加**

現在のコード (app.js:491-500):
```js
function setupTabListeners() {
  // タブボタンのクリックイベント（イベント委譲を使用）
  if (!tabListenersSetup) {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-btn')) {
        switchTab(e.target.dataset.tab);
      }
    });
    tabListenersSetup = true;
  }
```

以下に置き換える:
```js
function setupTabListeners() {
  // タブボタン & 保存ボタンのクリックイベント（イベント委譲を使用）
  if (!tabListenersSetup) {
    document.addEventListener('click', (e) => {
      // タブ切り替え
      if (e.target.classList.contains('tab-btn')) {
        switchTab(e.target.dataset.tab);
        return;
      }

      // タブ内の保存ボタン
      const saveBtn = e.target.closest('.tab-save-btn');
      if (saveBtn) {
        handleTabSaveClick(saveBtn);
        return;
      }
    });
    tabListenersSetup = true;
  }
```

- [ ] **Step 6.2: handleTabSaveClick 関数を app.js に追加**

`setupTabListeners` 関数の直前（app.js:487 付近、`let tabListenersSetup = false;` の直前）に以下の関数を追加する:

```js
// タブ内の「保存」ボタンがクリックされたときの処理
async function handleTabSaveClick(btn) {
  const groupId = btn.dataset.groupId;
  const group = designGroups.find(g => g.id === groupId);
  if (!group) {
    console.warn('[handleTabSaveClick] group not found for id:', groupId);
    return;
  }

  const iconEl = btn.querySelector('.tab-save-icon');
  const labelEl = btn.querySelector('.tab-save-label');

  // 状態: 保存中
  btn.dataset.state = 'saving';
  btn.disabled = true;
  if (iconEl) iconEl.textContent = '⏳';
  if (labelEl) labelEl.textContent = '保存中...';

  try {
    await saveDesignGroups();
    // 成功
    btn.dataset.state = 'success';
    if (iconEl) iconEl.textContent = '✅';
    if (labelEl) labelEl.textContent = '保存済';
    showToast(`「${group.name}」を保存しました`);
    setTimeout(() => {
      // renderで再生成されていなければ元に戻す
      if (document.body.contains(btn)) {
        btn.dataset.state = 'idle';
        btn.disabled = false;
        if (iconEl) iconEl.textContent = '💾';
        if (labelEl) labelEl.textContent = '保存';
      }
    }, 2000);
  } catch (err) {
    // 失敗（エラートーストはsaveDesignGroups側で表示済み）
    btn.dataset.state = 'error';
    btn.disabled = false;
    if (iconEl) iconEl.textContent = '⚠️';
    if (labelEl) labelEl.textContent = '再試行';
  }
}
```

- [ ] **Step 6.3: 動作確認 — ボタンクリックで保存と状態遷移を確認**

手順:
1. 拡張機能をリロード
2. ツールを開く
3. 任意のタブ（例: サムネテンプレ8種）の保存ボタンをクリック
4. 以下の遷移が起こることを確認:
   - 瞬間的に `⏳ 保存中...` に変わる
   - `✅ 保存済` に変わり、下部にトースト「『サムネテンプレ8種』を保存しました」が表示される
   - 約2秒後に `💾 保存` に戻る
5. DevTools Console で chrome.storage.local の中身を確認:
```js
chrome.storage.local.get('designGroups', (r) => console.log(r.designGroups.length));
```

期待結果: designGroups配列の長さが表示される。

- [ ] **Step 6.4: エラー状態の動作確認（手動でエラーを発生させる）**

手順:
1. DevTools Console で以下を実行し、`chrome.storage.local.set` を一時的に失敗させる:
```js
const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
chrome.storage.local.set = (items, cb) => {
  chrome.runtime.lastError = { message: 'Simulated quota error' };
  if (cb) cb();
  delete chrome.runtime.lastError;
};
```
2. 保存ボタンをクリック
3. 以下を確認:
   - 赤いトーストで「⚠️ 保存に失敗しました: ...」が表示される
   - ボタンが `⚠️ 再試行` 状態になり、背景が赤系になる（次のTask 7でCSS適用後）
4. Console で元に戻す:
```js
chrome.storage.local.set = originalSet;
```
5. ボタンをもう一度クリックして今度は正常に保存できることを確認

期待結果: エラートースト表示 → 再試行可能 → 再試行で成功。

- [ ] **Step 6.5: コミット**

```bash
git add app.js
git commit -m "feat(ui): wire up tab save button click handler

setupTabListeners のイベント委譲に .tab-save-btn を追加し、
handleTabSaveClick で idle → saving → success/error の状態
遷移を管理。成功時は2秒後にidleへ戻る。失敗時は再試行可能
な状態を維持。"
```

---

## Task 7: 保存ボタンのCSSスタイル追加

**Files:**
- Modify: `styles.css` (末尾に追加)

- [ ] **Step 7.1: styles.css の末尾に以下のスタイルを追加**

`styles.css` の最終行の後に以下を追加する（既存のスタイル定義とは衝突しない独立した規則群）:

```css
/* ===========================
   タブ内保存ボタン
   =========================== */

.tab-pane-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 0.5rem 0 0.75rem 0;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-color);
}

.tab-save-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
  font-family: inherit;
  white-space: nowrap;
}

.tab-save-btn:hover:not(:disabled) {
  background: var(--bg-card-hover);
  border-color: var(--border-highlight);
}

.tab-save-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.tab-save-btn:disabled {
  cursor: not-allowed;
  opacity: 0.75;
}

.tab-save-btn[data-state="success"] {
  background: var(--success);
  color: white;
  border-color: var(--success);
}

.tab-save-btn[data-state="error"] {
  background: var(--danger);
  color: white;
  border-color: var(--danger);
}

.tab-save-btn[data-state="error"]:hover:not(:disabled) {
  background: var(--danger);
  opacity: 0.9;
}

.tab-save-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  line-height: 1;
}

.tab-save-label {
  line-height: 1;
}
```

- [ ] **Step 7.2: 拡張機能をリロードして見た目確認**

手順:
1. 拡張機能をリロード
2. ツールを開く
3. 各タブで保存ボタンが右寄せで表示されていることを確認
4. ボタンをhoverして色が変わることを確認
5. ボタンをクリックし、以下の見た目遷移を確認:
   - idle: 暗いグレー背景
   - saving: 同じ見た目だが無効化
   - success: 緑背景 + 白文字
   - 2秒後にidleに戻る

- [ ] **Step 7.3: コミット**

```bash
git add styles.css
git commit -m "feat(ui): style tab save button with state variants

tab-pane-header, tab-save-btn のスタイルを追加。
data-state 属性で idle/saving/success/error の見た目を切替。
CSS変数 (--bg-input, --success, --danger 等) を利用してダーク
テーマと整合。"
```

---

## Task 8: エンドツーエンド手動テスト

実装全体が正しく動くことを確認する最終シナリオテスト。コード変更はなし。

- [ ] **Step 8.1: 基本シナリオ — インポートしたタブが再起動後も残る**

手順:
1. 拡張機能を完全リロード（`chrome://extensions/` から「サービスワーカー」をクリック→閉じる→再度「サービスワーカー」クリックでリセット）
2. ツールを開く
3. DevTools Console で現在のdesignGroupsをログ: `chrome.storage.local.get('designGroups', r => console.log('before:', r.designGroups.map(g => g.name)))`
4. ZIP または JSON のテンプレートをインポート（assets/tags/サムネテンプレ8種.zip 等）
5. インポートされたタブに切り替えて「💾 保存」ボタンをクリック
6. `✅ 保存済` + トースト表示を確認
7. ツールタブを閉じる
8. 拡張機能アイコンから再度ツールを開く
9. インポートしたタブが残っていることを確認

期待結果: インポート + 保存 → 再起動後もタブが存在する。

- [ ] **Step 8.2: 新規グループ追加シナリオ**

手順:
1. ツールを開く
2. 「新規グループを追加」ボタンをクリック
3. 名前入力: `手動テスト-新規`
4. 追加されたタブに切り替えて保存ボタンをクリック
5. 成功表示を確認
6. ツールを閉じて再起動
7. `手動テスト-新規` タブが残っていることを確認

期待結果: 再起動後もタブが存在する。

- [ ] **Step 8.3: 自動保存シナリオ（保存ボタンを押さないケース）**

手順:
1. ツールを開く
2. 新規グループ追加: `手動テスト-自動保存`
3. **保存ボタンを押さずに** ツールを閉じる
4. 再度ツールを開く
5. `手動テスト-自動保存` タブが残っていることを確認（addDesignGroup 内の await saveDesignGroups で自動保存されているはず）

期待結果: 自動保存でも再起動後に残る。

- [ ] **Step 8.4: 削除シナリオ — 削除が保存されること**

手順:
1. Step 8.2, 8.3 で作成したテスト用タブを選択
2. 「グループを削除」ボタンをクリック
3. 確認ダイアログでOK
4. タブが消えることを確認
5. ツールを閉じて再起動
6. 削除したタブが復活していないことを確認

期待結果: 削除も永続化されている。

- [ ] **Step 8.5: ストレージ使用量表示の確認**

手順:
1. DevTools Console:
```js
chrome.storage.local.getBytesInUse(null, b => console.log('bytes:', b));
```
2. サイドバー左下の「ストレージ使用量」表示が MB 単位で表示されていることを確認（赤字になっていないこと）

期待結果: 使用量が表示され、極端な値（マイナスや NaN）でないこと。

- [ ] **Step 8.6: 最終コミット（変更がなければスキップ）**

コード変更はないため、通常は何もコミットしない。テスト結果のメモが必要な場合のみ：

```bash
# 必要に応じて
git log --oneline -10
```

---

## 実装完了後のチェックリスト

- [ ] manifest.json に `"unlimitedStorage"` が含まれている
- [ ] app.js の `window.browserStorage` が chrome.storage.local を優先する実装になっている
- [ ] DevTools Console に `[Storage] Using backend: chrome` が出る
- [ ] 各タブの右上に `💾 保存` ボタンが表示される
- [ ] 保存ボタンクリックで idle → saving → success の遷移とトースト表示が起こる
- [ ] 失敗時は `⚠️ 再試行` 状態になり赤背景で表示される
- [ ] インポート / 新規グループ / 削除が再起動後に永続化される
- [ ] 既存のサムネテンプレ8種の表示が崩れていない
- [ ] Chrome DevTools Console にエラーが出ていない
