# APIYI プロバイダー選択機能 設計書

**日付:** 2026-03-29
**対象:** ClickDesign 1.2 (`app.js`, `index.html`, `styles.css`)
**目的:** FAL AI に加え APIYI を画像生成プロバイダーとして追加し、設定モーダルでラジオボタンにより切り替えられるようにする

---

## 背景・目的

現在 ClickDesign 1.2 は FAL AI (`queue.fal.run`) を唯一の画像生成プロバイダーとして使用している。APIYI (`api.apiyi.com`) は nano-banana-pro モデルを $0.05/枚で提供しており、コスト削減の選択肢として有効。ユーザーが設定画面でいずれかを選択・保存できる仕組みを追加する。

---

## UI 変更: API モーダル

### ラジオボタン追加

既存の `#apiModal` に、APIキー入力欄の上にプロバイダー選択ラジオボタンを追加する。

```
┌─────────────────────────────────┐
│ ⚙ API設定                    × │
├─────────────────────────────────┤
│ プロバイダー選択                 │
│  (●) FAL AI   ( ) APIYI         │
│                                 │
│ APIキー                         │
│ [____________________________]  │
│                                 │
│ [FAL AI 選択時のガイド]          │
│  → APIキー取得: fal.ai/...      │
│  → クレジット: fal.ai/billing   │
│                                 │
│ [APIYI 選択時のガイド]           │
│  → APIキー取得: api.apiyi.com   │
│  → 料金: $0.05/枚               │
│                                 │
│  ⚠ 注意事項                     │
├─────────────────────────────────┤
│ [キャンセル]        [保存して閉じる] │
└─────────────────────────────────┘
```

### 動的表示切り替え

- ラジオボタン切り替え時、APIキー入力欄のプレースホルダーとガイドリンクを選択中プロバイダーに合わせて切り替える
- 保存済みキーは各プロバイダーごとに復元して表示する

---

## データ設計

### localStorage キー

| キー | 型 | 説明 |
|------|----|------|
| `falApiKey` | string | 既存。FAL AI の API キー |
| `apiyiApiKey` | string | 新規。APIYI の API キー |
| `selectedProvider` | `"fal"` \| `"apiyi"` | 新規。選択中プロバイダー。デフォルト: `"fal"` |

---

## API 仕様比較

| 項目 | FAL AI | APIYI |
|------|--------|-------|
| エンドポイント | `https://queue.fal.run/fal-ai/nano-banana-pro` | `https://api.apiyi.com/v1/images/generations` |
| 方式 | 非同期キュー + ポーリング | 同期（OpenAI 互換） |
| 認証 | `Authorization: Key <apiKey>` | `Authorization: Bearer <apiKey>` |
| 参照画像 | FAL CDN URL | Base64 埋め込み（対応確認が必要） |
| モデル指定 | URL パスに含む | `model` パラメータで指定 |

---

## コード変更方針

### app.js

#### 1. グローバル変数追加

```javascript
let apiyiApiKey = '';
let selectedProvider = 'fal'; // 'fal' | 'apiyi'
```

#### 2. loadApiKey() 拡張

既存の `falApiKey` 読み込みに加え、`apiyiApiKey` と `selectedProvider` を読み込む。

#### 3. saveApiKey() 拡張

選択中プロバイダーに応じたキー (`falApiKey` または `apiyiApiKey`) と `selectedProvider` を保存する。

#### 4. callImageGenerationAPI() に分岐追加

```javascript
async function callImageGenerationAPI(prompt, images, aspectRatio) {
    if (selectedProvider === 'apiyi') {
        return await callApiyiAPI(prompt, images, aspectRatio);
    }
    // 既存の FAL AI 処理（変更なし）
    ...
}
```

#### 5. callApiyiAPI() 新規追加

- エンドポイント: `https://api.apiyi.com/v1/images/generations`
- 認証: `Authorization: Bearer <apiyiApiKey>`
- リクエスト形式: OpenAI 互換 JSON
- 同期レスポンス処理（ポーリング不要）
- 残高不足エラー（402）は既存のエラーハンドリングと同形式で処理

#### 6. プロバイダー切り替え時のキャッシュクリア

`selectedProvider` 変更時に `generatedImages` をリセットして異なるプロバイダーの結果が混在しないようにする。

### index.html

- `#apiModal` にラジオボタン UI を追加
- FAL AI 用・APIYI 用のガイドリンクブロックをそれぞれ追加（JavaScript で表示切り替え）

### styles.css

- ラジオボタン選択 UI のスタイル追加（既存モーダルのデザインに合わせる）

### manifest.json

- APIYI のホスト権限を追加: `"https://api.apiyi.com/*"`

---

## 未確認事項・リスク

### 参照画像対応

APIYI 経由での nano-banana-pro が image-to-image（参照画像付き生成）に対応しているか未確認。

**対処方針:**
1. まずテキストプロンプトのみで動作確認
2. 参照画像非対応の場合、APIYI 選択時に「サンプル画像・キャラクター画像・デザイン参照は使用されません」と通知を表示する

### APIYI モデル名

`/v1/images/generations` での nano-banana-pro のモデル指定名（`model` パラメータの値）は実装時に APIYI ドキュメントで確認する。

---

## 対象外

- 生成ボタン付近での都度切り替え（設定モーダルでの一括設定のみ）
- 3つ目以降のプロバイダー追加
- FAL AI 側の既存処理の変更
