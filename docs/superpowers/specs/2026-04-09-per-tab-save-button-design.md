# タブごとの保存ボタンと永続化信頼性向上

**作成日**: 2026-04-09
**対象**: ClickDesign1.2 Chrome拡張機能

## 背景と問題

### 現状の症状
- ユーザーがテンプレートをインポートする、または新規グループを追加すると、UIには反映される
- しかしツール（index.htmlタブ）を閉じて開き直すと、追加した内容が消えてしまう
- ユーザーは「保存できているのか不明」で不安を感じている

### 根本原因の分析
コード調査の結果、技術的には以下の問題が複合している：

1. **Chrome拡張機能なのに `localStorage` を使っている**
   - `manifest.json` には `"storage"` 権限が付与済みなのに、`window.browserStorage` の実装（app.js:71-146）は `localStorage` ラッパーになっている
   - `chrome.storage.local` のほうが拡張機能として本来の選択肢

2. **保存失敗がサイレントに握りつぶされている**
   - `browserStorage.set` の catch 節は `console.warn` のみ（app.js:105-106）
   - ユーザーには失敗が一切伝わらない

3. **`addDesignGroup` で `saveDesignGroups()` が await されていない**
   - app.js:627 — 実害はおそらく無いがコードの健全性として問題

4. **容量不安**
   - `localStorage` は5〜10MB制限
   - Base64画像を含むテンプレートは将来的に容量オーバーしやすい

## ゴール

1. ユーザーがタブ内容を明示的に保存できる「保存ボタン」を各タブに実装する
2. 保存の成功・失敗が常に明確にユーザーへフィードバックされる
3. ストレージ層を Chrome拡張機能として正しいAPIに差し替え、容量制限を事実上撤廃する
4. 既存の自動保存フローは維持し、二重安全にする
5. どのブラウザ/OSでも動くよう多段フォールバックを実装する

## 非ゴール

- タブ単位での差分保存（複雑化するのでやらない。保存ボタンは全体を保存する）
- 編集機能（editDesignGroupBtn）の有効化（既に意図的に無効化されている）
- 画像ライブラリ等、他の保存フローの変更（スコープ外）

## 設計

### 1. ストレージ層の多段フォールバック

`window.browserStorage` の実装を以下の優先順位で差し替える：

```
優先順位:
1. chrome.storage.local      ← Chrome拡張機能API（最優先）
2. IndexedDB                 ← 拡張機能APIが無い環境用
3. localStorage              ← 最終フォールバック
```

**選定方法**: 起動時に一度だけ判定してモジュール変数にキャッシュする。

```js
const storageBackend = (() => {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return 'chrome';
  }
  if (typeof indexedDB !== 'undefined') {
    return 'idb';
  }
  if (isLocalStorageAvailable()) {
    return 'localStorage';
  }
  return 'memory';
})();
```

**インターフェース**: 既存の `get / set / remove / getBytesInUse` を維持し、呼び出し側コードは一切変更しない。内部実装だけを差し替える。

**IndexedDB実装方針**: 外部ライブラリは使わない。単一オブジェクトストア `kv` を使い、キーバリュー形式で保存するシンプルな薄いラッパーを書く（約80行）。

### 2. manifest.json の変更

```json
"permissions": [
  "activeTab",
  "contextMenus",
  "scripting",
  "storage",
  "unlimitedStorage",   // ← 追加
  "notifications"
]
```

`unlimitedStorage` 権限により、`chrome.storage.local` および IndexedDB の容量制限が事実上撤廃される。

### 3. エラー伝播の改善

`browserStorage.set` の catch 節を修正し、エラーを握りつぶさず **throw して呼び出し側に伝える**。

```js
set: async (items) => {
  // バックエンドごとに保存を試みる
  // 失敗したら throw new Error(詳細メッセージ)
}
```

`saveDesignGroups` 側で try/catch し、失敗時は赤いトーストで明示通知する：

```js
async function saveDesignGroups() {
  try {
    await window.browserStorage.set({ designGroups: designGroups });
    await updateStorageUsage();
  } catch (err) {
    console.error('saveDesignGroups failed:', err);
    showToast('⚠️ 保存に失敗しました: ' + err.message, 7000);
    throw err;  // 呼び出し元が明示保存なら再throwして状態更新に使う
  }
}
```

### 4. 既存データの自動マイグレーション

`loadDesignGroups()` の冒頭に以下を追加：

- まず新バックエンド（`chrome.storage.local` 等）から `designGroups` を読む
- 空かつ `localStorage` に旧データがあれば、自動的にコピーして新バックエンドに書き込む
- マイグレーション成功後、旧 `localStorage` のデータは残したまま（安全のため削除しない）

これにより、既にデータが消えてしまっているユーザーは影響なし、残っているユーザーは無痛で移行される。

### 5. タブごとの保存ボタン

#### 配置
各タブペイン（`.tab-pane`）の上部、右寄せ。

#### HTML構造（renderDesignGroups 内で生成）

```html
<div class="tab-pane" id="tab-{group.id}">
  <div class="tab-pane-header">
    <!-- 左側は空き、または将来拡張用 -->
    <button class="tab-save-btn"
            data-group-id="{group.id}"
            title="このタブを保存">
      <span class="tab-save-icon">💾</span>
      <span class="tab-save-label">保存</span>
    </button>
  </div>
  <div class="style-grid" data-group="{group.id}">
    ...
  </div>
</div>
```

#### 状態遷移

| 状態 | 表示 | 背景色 | 操作 |
|------|------|--------|------|
| 通常 (idle) | `💾 保存` | グレー | クリックで保存実行 |
| 保存中 (saving) | `⏳ 保存中...` | グレー | 無効化 |
| 成功 (success) | `✅ 保存済` | 緑 | 2秒後に idle へ戻る |
| 失敗 (error) | `⚠️ 再試行` | 赤 | クリックで再試行 |

状態はボタン要素の `data-state` 属性で管理し、CSSで見た目を切り替える。

#### クリックハンドラ（イベント委譲で setupEventListeners 内に追加）

```js
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.tab-save-btn');
  if (!btn) return;

  const groupId = btn.dataset.groupId;
  const group = designGroups.find(g => g.id === groupId);
  if (!group) return;

  // 状態: 保存中
  btn.dataset.state = 'saving';
  btn.querySelector('.tab-save-label').textContent = '保存中...';
  btn.querySelector('.tab-save-icon').textContent = '⏳';
  btn.disabled = true;

  try {
    await saveDesignGroups();  // 全designGroupsを保存（単体差分はやらない）
    // 成功
    btn.dataset.state = 'success';
    btn.querySelector('.tab-save-label').textContent = '保存済';
    btn.querySelector('.tab-save-icon').textContent = '✅';
    showToast(`「${group.name}」を保存しました`);
    setTimeout(() => {
      btn.dataset.state = 'idle';
      btn.querySelector('.tab-save-label').textContent = '保存';
      btn.querySelector('.tab-save-icon').textContent = '💾';
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    // 失敗（トーストは saveDesignGroups 側で表示済み）
    btn.dataset.state = 'error';
    btn.querySelector('.tab-save-label').textContent = '再試行';
    btn.querySelector('.tab-save-icon').textContent = '⚠️';
    btn.disabled = false;
  }
});
```

### 6. CSS

`styles.css` に追加：

```css
.tab-pane-header {
  display: flex;
  justify-content: flex-end;
  padding: 0.5rem 0 0.75rem 0;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.tab-save-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-main);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.tab-save-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.tab-save-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.tab-save-btn[data-state="success"] {
  background: #1a7f3a;
  color: white;
  border-color: #1a7f3a;
}

.tab-save-btn[data-state="error"] {
  background: #c0392b;
  color: white;
  border-color: #c0392b;
}
```

### 7. 自動保存の維持

既存の自動保存呼び出し（import, addDesignGroup, delete 等）はそのまま残す。
ただし以下の修正を加える：

- `addDesignGroup` の `saveDesignGroups()` に `await` を付与（app.js:627）
- 自動保存の失敗も赤トーストで通知されるようになる（saveDesignGroups のエラー伝播改善の副作用）

## 実装影響範囲

| ファイル | 変更内容 | 概算行数 |
|---------|---------|---------|
| `app.js` | `window.browserStorage` 実装差し替え（chrome.storage/IndexedDB対応）、`saveDesignGroups` のエラー通知強化、`renderDesignGroups` 内に保存ボタンHTML追加、クリックハンドラ追加、マイグレーション処理、`addDesignGroup` の await 修正 | +200 / -30 |
| `manifest.json` | `"unlimitedStorage"` 権限追加 | +1 |
| `styles.css` | `.tab-pane-header`, `.tab-save-btn` のスタイル追加 | +40 |
| `index.html` | 変更なし | 0 |

## テスト方針

Chrome拡張機能のため自動テストは難しいが、手動で以下のシナリオを確認：

1. **基本保存**:
   - ツール起動 → インポート → 保存ボタンクリック → ✅ 保存済 表示
   - ツールを閉じて再起動 → インポートしたタブが残っていることを確認

2. **新規グループ**:
   - 新規グループ追加 → 保存ボタンクリック → 再起動で残存確認

3. **自動保存**:
   - インポート後、保存ボタンを押さずにツールを閉じる → 再起動で残っていることを確認（自動保存で救われる）

4. **エラー表示**:
   - 一時的に `chrome.storage.local.set` を失敗させる（DevToolsで上書き）→ 赤トースト表示、ボタンが「⚠️ 再試行」になることを確認

5. **マイグレーション**:
   - localStorageに旧データを手動で配置 → 起動 → chrome.storage.localに移行されることを確認

6. **容量**:
   - 大きな画像を含むテンプレートを複数インポートしても保存できることを確認

## ロールバック戦略

問題が発生した場合：
- `manifest.json` から `"unlimitedStorage"` を削除してもデータ損失はしない（権限無しでもchrome.storage.localは動く、容量が戻るだけ）
- `window.browserStorage` の実装を git で元に戻せばlocalStorageベースに戻る（移行済みユーザーはchrome.storage.localのデータが残ってしまうが、localStorage にも同じデータが残っている）
