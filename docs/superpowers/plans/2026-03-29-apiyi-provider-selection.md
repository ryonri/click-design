# APIYI プロバイダー選択機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FAL AI に加えて APIYI を画像生成プロバイダーとして追加し、API設定モーダルのラジオボタンで切り替えできるようにする

**Architecture:** `manifest.json` にAPIYIのホスト権限を追加し、`index.html` の `#apiModal` にプロバイダー選択ラジオボタンUIを追加する。`app.js` では `selectedProvider` グローバル変数で分岐し、APIYI選択時は新規の `callApiyiAPI()` 関数（OpenAI互換・同期方式）を呼び出す。FAL AI側の既存処理は一切変更しない。

**Tech Stack:** Vanilla JavaScript, Fetch API, OpenAI互換 REST API (APIYI), Chrome Extension Manifest V3

---

## ファイル変更一覧

| ファイル | 変更種別 | 内容 |
|----------|----------|------|
| `manifest.json` | 修正 | `host_permissions` に `https://api.apiyi.com/*` を追加 |
| `index.html` | 修正 | `#apiModal` にラジオボタン・APIYIガイドブロックを追加 |
| `styles.css` | 修正 | ラジオボタン選択UIのスタイルを追加 |
| `app.js` | 修正 | グローバル変数追加、`loadApiKey` / `saveApiKey` / `openApiModal` / `checkApiKeyWarning` 拡張、`callApiyiAPI` 新規追加、`callImageGenerationAPI` に分岐追加 |

---

## Task 1: manifest.json にAPIYIホスト権限を追加

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: `host_permissions` に APIYI を追加**

`manifest.json` の `host_permissions` 配列の末尾に追加する：

```json
"host_permissions": [
  "https://queue.fal.run/*",
  "https://fal.run/*",
  "https://api.fal.ai/*",
  "https://api.fal.run/*",
  "https://rest.alpha.fal.ai/*",
  "https://v3b.fal.media/*",
  "https://fal.media/*",
  "https://api.apiyi.com/*"
],
```

- [ ] **Step 2: コミット**

```bash
cd "/Users/ryonri/Desktop/(納品用)テンプレート集/ClickDesign/clickdesign1.2"
git add manifest.json
git commit -m "feat: add apiyi.com to manifest host_permissions"
```

---

## Task 2: index.html にプロバイダー選択UIを追加

**Files:**
- Modify: `index.html` (line 253–307: `#apiModal`)

- [ ] **Step 1: `#apiModal` のヘッダータイトルを変更し、ラジオボタンとAPIYIガイドを追加**

`index.html` の `<div id="apiModal" ...>` ブロック全体を以下に差し替える：

```html
<div id="apiModal" class="modal">
  <div class="modal-card api-modal-card">
    <div class="modal-header">
      <h2><i class="fas fa-key"></i> API設定</h2>
      <span class="close">&times;</span>
    </div>
    <div class="modal-body">

      <!-- プロバイダー選択 -->
      <div class="provider-selector">
        <label class="provider-label">プロバイダー選択</label>
        <div class="provider-options">
          <label class="provider-option">
            <input type="radio" name="provider" value="fal" id="providerFal" checked>
            <span class="provider-option-label">FAL AI</span>
          </label>
          <label class="provider-option">
            <input type="radio" name="provider" value="apiyi" id="providerApiyi">
            <span class="provider-option-label">APIYI</span>
          </label>
        </div>
      </div>

      <div class="api-input-section">
        <label for="falExternalKeyConfig" id="apiKeyLabel">FAL API Key</label>
        <div class="input-wrapper glow-effect">
          <input type="text" id="falExternalKeyConfig" placeholder="APIキーを入力してください (例: fal_key_...)"
            autocomplete="new-password" style="-webkit-text-security: disc; text-security: disc;" data-lpignore="true"
            data-bwignore="true">
        </div>
      </div>

      <!-- FAL AI ガイド -->
      <div class="api-guide-section" id="guideBlockFal">
        <div class="guide-item">
          <div class="guide-icon"><i class="fas fa-external-link-alt"></i></div>
          <div class="guide-content">
            <h3>APIキーの取得方法</h3>
            <a href="https://fal.ai/dashboard/keys" target="_blank" class="link-btn">
              こちらのページ<i class="fas fa-arrow-right"></i>
            </a>
            <p>でFAL APIキーを取得してください</p>
          </div>
        </div>
        <div class="guide-item">
          <div class="guide-icon"><i class="fas fa-credit-card"></i></div>
          <div class="guide-content">
            <h3>クレジットのチャージ方法</h3>
            <a href="https://fal.ai/dashboard/billing" target="_blank" class="link-btn">
              こちらのページ<i class="fas fa-arrow-right"></i>
            </a>
            <p>でクレジットをチャージしてください</p>
          </div>
        </div>
      </div>

      <!-- APIYI ガイド -->
      <div class="api-guide-section" id="guideBlockApiyi" style="display: none;">
        <div class="guide-item">
          <div class="guide-icon"><i class="fas fa-external-link-alt"></i></div>
          <div class="guide-content">
            <h3>APIキーの取得方法</h3>
            <a href="https://api.apiyi.com" target="_blank" class="link-btn">
              こちらのページ<i class="fas fa-arrow-right"></i>
            </a>
            <p>でAPIYI APIキーを取得してください</p>
          </div>
        </div>
        <div class="guide-item">
          <div class="guide-icon"><i class="fas fa-yen-sign"></i></div>
          <div class="guide-content">
            <h3>料金</h3>
            <p>nano-banana-pro: $0.05/枚</p>
          </div>
        </div>
      </div>

      <div class="warning-box">
        <h3><i class="fas fa-exclamation-triangle"></i> 重要な注意事項</h3>
        <ul>
          <li>APIキーはブラウザのストレージに保存されます（暗号化されません）</li>
          <li>共有PCや公共のPCでは使用しないでください</li>
          <li>APIキーが漏洩すると不正利用される可能性があります</li>
        </ul>
      </div>
    </div>
    <div class="modal-footer">
      <button id="cancelApiBtn" class="btn secondary">キャンセル</button>
      <button id="saveApiBtn" class="btn primary">保存して閉じる</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: コミット**

```bash
git add index.html
git commit -m "feat: add provider radio buttons to API settings modal"
```

---

## Task 3: styles.css にプロバイダー選択スタイルを追加

**Files:**
- Modify: `styles.css` (末尾に追加)

- [ ] **Step 1: ラジオボタン選択UIのスタイルをCSSの末尾に追加**

```css
/* Provider Selector */
.provider-selector {
  margin-bottom: 16px;
}

.provider-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #aaa);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.provider-options {
  display: flex;
  gap: 12px;
}

.provider-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 16px;
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  transition: border-color 0.2s, background 0.2s;
  flex: 1;
  justify-content: center;
}

.provider-option:hover {
  border-color: var(--accent-color, #7c6af7);
}

.provider-option input[type="radio"] {
  accent-color: var(--accent-color, #7c6af7);
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.provider-option input[type="radio"]:checked + .provider-option-label {
  color: var(--accent-color, #7c6af7);
  font-weight: 600;
}

.provider-option:has(input:checked) {
  border-color: var(--accent-color, #7c6af7);
  background: rgba(124, 106, 247, 0.08);
}

.provider-option-label {
  font-size: 14px;
  color: var(--text-primary, #eee);
  cursor: pointer;
  user-select: none;
}
```

- [ ] **Step 2: コミット**

```bash
git add styles.css
git commit -m "feat: add provider selector styles to API modal"
```

---

## Task 4: app.js — グローバル変数追加とキー管理関数の拡張

**Files:**
- Modify: `app.js`

- [ ] **Step 1: グローバル変数を追加（`app.js` line 165 付近）**

```javascript
// 変更前
let falApiKey = null;
```

```javascript
// 変更後
let falApiKey = null;
let apiyiApiKey = '';
let selectedProvider = 'fal'; // 'fal' | 'apiyi'
```

- [ ] **Step 2: `loadApiKey()` を拡張（line 1355 付近）**

```javascript
// 変更前
async function loadApiKey() {
  const result = await window.browserStorage.get('falApiKey');
  if (result.falApiKey) {
    falApiKey = result.falApiKey;
  }
}
```

```javascript
// 変更後
async function loadApiKey() {
  const result = await window.browserStorage.get(['falApiKey', 'apiyiApiKey', 'selectedProvider']);
  if (result.falApiKey) {
    falApiKey = result.falApiKey;
  }
  if (result.apiyiApiKey) {
    apiyiApiKey = result.apiyiApiKey;
  }
  if (result.selectedProvider) {
    selectedProvider = result.selectedProvider;
  }
}
```

- [ ] **Step 3: `openApiModal()` を拡張（line 1363 付近）**

```javascript
// 変更前
function openApiModal() {
  apiKeyInput.value = falApiKey || '';
  apiModal.classList.add('show');
}
```

```javascript
// 変更後
function openApiModal() {
  // ラジオボタンを現在のプロバイダーに合わせてセット
  const radioFal = document.getElementById('providerFal');
  const radioApiyi = document.getElementById('providerApiyi');
  if (radioFal && radioApiyi) {
    radioFal.checked = selectedProvider === 'fal';
    radioApiyi.checked = selectedProvider === 'apiyi';
  }
  // 対応するキーを入力欄に復元
  apiKeyInput.value = selectedProvider === 'apiyi' ? (apiyiApiKey || '') : (falApiKey || '');
  updateApiModalForProvider(selectedProvider);
  apiModal.classList.add('show');
}
```

- [ ] **Step 4: `saveApiKey()` を拡張（line 1433 付近）**

```javascript
// 変更前
async function saveApiKey() {
  const newApiKey = apiKeyInput.value.trim();
  if (!newApiKey) {
    alert('APIキーを入力してください');
    return;
  }

  falApiKey = newApiKey;
  await window.browserStorage.set({ falApiKey: newApiKey });
  alert('APIキーを保存しました');
  closeApiModal();

  // APIキー警告表示を更新
  checkApiKeyWarning();
}
```

```javascript
// 変更後
async function saveApiKey() {
  const newApiKey = apiKeyInput.value.trim();
  if (!newApiKey) {
    alert('APIキーを入力してください');
    return;
  }

  // 選択中のプロバイダーを読み取る
  const radioApiyi = document.getElementById('providerApiyi');
  const newProvider = (radioApiyi && radioApiyi.checked) ? 'apiyi' : 'fal';

  // プロバイダーが変わった場合はキャッシュをクリア
  if (newProvider !== selectedProvider) {
    generatedImages = {};
  }

  selectedProvider = newProvider;

  if (selectedProvider === 'apiyi') {
    apiyiApiKey = newApiKey;
    await window.browserStorage.set({ apiyiApiKey: newApiKey, selectedProvider: 'apiyi' });
  } else {
    falApiKey = newApiKey;
    await window.browserStorage.set({ falApiKey: newApiKey, selectedProvider: 'fal' });
  }

  alert('APIキーを保存しました');
  closeApiModal();

  checkApiKeyWarning();
}
```

- [ ] **Step 5: `checkApiKeyWarning()` を拡張（line 1421 付近）**

```javascript
// 変更前
function checkApiKeyWarning() {
  const warningElement = document.getElementById('apiKeyWarning');
  if (!warningElement) return;

  if (!falApiKey || falApiKey.trim() === '') {
    warningElement.style.display = 'inline-block';
  } else {
    warningElement.style.display = 'none';
  }
}
```

```javascript
// 変更後
function checkApiKeyWarning() {
  const warningElement = document.getElementById('apiKeyWarning');
  if (!warningElement) return;

  const activeKey = selectedProvider === 'apiyi' ? apiyiApiKey : falApiKey;
  if (!activeKey || activeKey.trim() === '') {
    warningElement.style.display = 'inline-block';
  } else {
    warningElement.style.display = 'none';
  }
}
```

- [ ] **Step 6: `updateApiModalForProvider()` ヘルパー関数を追加（`openApiModal` の直後に追加）**

```javascript
// プロバイダー切り替え時にモーダルUIを更新するヘルパー
function updateApiModalForProvider(provider) {
  const guideBlockFal = document.getElementById('guideBlockFal');
  const guideBlockApiyi = document.getElementById('guideBlockApiyi');
  const apiKeyLabel = document.getElementById('apiKeyLabel');

  if (provider === 'apiyi') {
    if (guideBlockFal) guideBlockFal.style.display = 'none';
    if (guideBlockApiyi) guideBlockApiyi.style.display = '';
    if (apiKeyLabel) apiKeyLabel.textContent = 'APIYI API Key';
    apiKeyInput.placeholder = 'APIキーを入力してください (例: sk-...)';
  } else {
    if (guideBlockFal) guideBlockFal.style.display = '';
    if (guideBlockApiyi) guideBlockApiyi.style.display = 'none';
    if (apiKeyLabel) apiKeyLabel.textContent = 'FAL API Key';
    apiKeyInput.placeholder = 'APIキーを入力してください (例: fal_key_...)';
  }
}
```

- [ ] **Step 7: ラジオボタンのchangeイベントをイベントリスナー登録箇所（line 1293 付近）に追加**

```javascript
// 既存のイベントリスナー登録ブロックに追加
document.querySelectorAll('input[name="provider"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const newProvider = e.target.value;
    // 切り替え前のキーを一時保存し、切り替え先のキーを入力欄に表示
    if (newProvider === 'apiyi') {
      apiKeyInput.value = apiyiApiKey || '';
    } else {
      apiKeyInput.value = falApiKey || '';
    }
    updateApiModalForProvider(newProvider);
  });
});
```

- [ ] **Step 8: コミット**

```bash
git add app.js
git commit -m "feat: add apiyiApiKey/selectedProvider globals and extend key management functions"
```

---

## Task 5: app.js — `callApiyiAPI()` 関数を追加

**Files:**
- Modify: `app.js` (`callImageGenerationAPI` 関数の直後、line 1935 付近に追加)

- [ ] **Step 1: アスペクト比→サイズ変換ヘルパーを追加**

```javascript
// APIYI (OpenAI互換) 用のアスペクト比→sizeパラメータ変換
function mapAspectRatioToSize(aspectRatio) {
  const map = {
    '16:9':  '1792x1024',
    '9:16':  '1024x1792',
    '1:1':   '1024x1024',
    '4:3':   '1365x1024',
    '3:4':   '1024x1365',
    '3:2':   '1536x1024',
    '2:3':   '1024x1536',
  };
  return map[aspectRatio] || '1024x1024';
}
```

- [ ] **Step 2: `callApiyiAPI()` 関数を追加**

```javascript
async function callApiyiAPI(style, groupId, aspectRatio, abortSignal) {
  console.log('Generating image with APIYI: style:', style, 'groupId:', groupId, 'aspectRatio:', aspectRatio);

  if (!apiyiApiKey || apiyiApiKey.trim() === '') {
    throw new Error('APIYIのAPIキーが設定されていません。右上の「⚙️ API設定」ボタンからAPIキーを入力してください。');
  }

  // タイトルとページ内容を取得
  const title = titleInput.value.trim();
  const content = pageContentTextarea.value;
  const themeColor = getSelectedThemeColor();

  // プロンプトを取得（callImageGenerationAPIと同じロジック）
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

  const requestBody = {
    model: 'nano-banana-pro',
    prompt: fullPrompt,
    n: 1,
    size: mapAspectRatioToSize(aspectRatio),
  };

  const fetchOptions = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiyiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  };

  if (abortSignal) {
    fetchOptions.signal = abortSignal;
  }

  try {
    const response = await fetch('https://api.apiyi.com/v1/images/generations', fetchOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const isBalanceError = response.status === 402 ||
        (errorData.error && errorData.error.message &&
          ['balance', 'credit', 'payment', 'insufficient'].some(kw =>
            errorData.error.message.toLowerCase().includes(kw)
          ));
      if (isBalanceError) {
        throw new Error('APIYI_BALANCE_INSUFFICIENT');
      }
      const errorMsg = (errorData.error && errorData.error.message) || response.statusText;
      throw new Error(`APIYI API Error: ${response.status} - ${errorMsg}`);
    }

    const data = await response.json();
    console.log('APIYI API Response:', data);

    if (data.data && data.data.length > 0 && data.data[0].url) {
      return data.data[0].url;
    }
    throw new Error('APIYIからの画像生成に失敗しました');

  } catch (error) {
    console.error('APIYI API Error:', error);
    throw error;
  }
}
```

- [ ] **Step 3: コミット**

```bash
git add app.js
git commit -m "feat: add callApiyiAPI() with OpenAI-compatible image generation"
```

---

## Task 6: app.js — `callImageGenerationAPI()` に分岐とエラー処理を追加

**Files:**
- Modify: `app.js` (line 1629 付近)

- [ ] **Step 1: `callImageGenerationAPI()` の冒頭にAPIYI分岐を追加**

```javascript
// 変更前（line 1629 から）
async function callImageGenerationAPI(style, groupId = 'home', aspectRatio = '16:9', abortSignal = null) {
  console.log('Generating image with style:', style, 'groupId:', groupId, 'aspectRatio:', aspectRatio);

  // APIキーのチェック
  if (!falApiKey || falApiKey.trim() === '') {
    throw new Error('APIキーが設定されていません。右上の「⚙️ API設定」ボタンからAPIキーを入力してください。');
  }
```

```javascript
// 変更後
async function callImageGenerationAPI(style, groupId = 'home', aspectRatio = '16:9', abortSignal = null) {
  console.log('Generating image with style:', style, 'groupId:', groupId, 'aspectRatio:', aspectRatio);

  // APIYI プロバイダーの場合は専用関数へ委譲
  if (selectedProvider === 'apiyi') {
    return await callApiyiAPI(style, groupId, aspectRatio, abortSignal);
  }

  // APIキーのチェック（FAL AI）
  if (!falApiKey || falApiKey.trim() === '') {
    throw new Error('APIキーが設定されていません。右上の「⚙️ API設定」ボタンからAPIキーを入力してください。');
  }
```

- [ ] **Step 2: エラーハンドラで `APIYI_BALANCE_INSUFFICIENT` を処理する箇所を確認**

`app.js` 内で `FAL_BALANCE_INSUFFICIENT` を検索し、同じ箇所で `APIYI_BALANCE_INSUFFICIENT` も処理されるよう以下のパターンを見つけて修正する。

```javascript
// 変更前（FAL_BALANCE_INSUFFICIENTを処理している箇所を検索）
if (error.message === 'FAL_BALANCE_INSUFFICIENT') {
```

```javascript
// 変更後
if (error.message === 'FAL_BALANCE_INSUFFICIENT' || error.message === 'APIYI_BALANCE_INSUFFICIENT') {
```

- [ ] **Step 3: コミット**

```bash
git add app.js
git commit -m "feat: add APIYI provider branch in callImageGenerationAPI"
```

---

## Task 7: 動作確認チェックリスト

テスト環境: ブラウザで `index.html` を直接開く（または Chrome拡張として読み込む）

- [ ] **確認1: FAL AI（デフォルト）モーダル表示**
  - 歯車アイコンをクリック → モーダルが開く
  - 「FAL AI」ラジオボタンがデフォルトで選択されている
  - 「FAL API Key」ラベルが表示されている
  - FAL AI のガイドリンクが表示されている

- [ ] **確認2: APIYI へのラジオボタン切り替え**
  - 「APIYI」を選択 → ガイドが APIYI 用に切り替わる
  - ラベルが「APIYI API Key」になる
  - APIYI のガイドリンク（api.apiyi.com）が表示される
  - FAL AI ガイドが非表示になる

- [ ] **確認3: APIキーの保存と復元**
  - APIYI を選択 → テスト用キーを入力 → 「保存して閉じる」
  - 再度モーダルを開く → APIYI が選択され、保存したキーが表示されている
  - FAL AI に切り替え → FAL のキーが表示される（別々に保存される）

- [ ] **確認4: プロバイダー切り替え時のキャッシュクリア**
  - FAL AI で画像を1枚生成 → APIYI に切り替えて保存
  - 生成済みサムネイルが消えている（`generatedImages` がリセットされた）

- [ ] **確認5: FAL AI での画像生成（既存機能の非破壊確認）**
  - FAL AI キーを設定 → サムネイル生成 → 正常に生成される

- [ ] **確認6: APIYI での画像生成**
  - APIYI キーを設定 → サムネイル生成 → 正常に生成される
  - ブラウザ開発者ツールのコンソールで `APIYI API Response:` ログを確認

- [ ] **確認7: 残高不足エラー（APIYI）**
  - 残高0のAPIYIキーで生成を試みる → 残高不足のエラーメッセージが表示される

---

## 注意事項

### APIYI モデル名の確認

実装後の初回テスト時に `callApiyiAPI` のリクエストボディの `model` 値 (`"nano-banana-pro"`) が正しいかを確認する。APIYI 側で別のモデル識別子が使われている場合は `callApiyiAPI()` の `model` 値を修正する。

### 参照画像（image-to-image）について

現実装の `callApiyiAPI()` はテキストプロンプトのみ（参照画像なし）。APIYI の nano-banana-pro が image-to-image に対応している場合は別途追加実装が必要。未対応の場合は APIYI 選択時に参照画像セクションへの通知表示を追加することを検討する。
