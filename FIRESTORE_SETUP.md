# 未購入者バイパス問題の原因と恒久対策

## 症状
`index.html` のログイン画面で、**未購入者のメールアドレスでもログインリンクが送信され、リンクをクリックするとツール画面に遷移してしまう**。

## 原因
Firestore セキュリティルールが「テストモード」(`allow read, write: if true`) のままになっており、
`register.html` が **合言葉を検証せずに** `allowlist/{email}` ドキュメントを作成できてしまうため。

クライアント側 (`auth.js`) は「allowlist にドキュメントが存在するか」しか確認していません。これは設計通りで、**合言葉の検証は Firestore ルール側で行う前提**になっています（ルールが守りの砦）。

従って、ルールが正しくデプロイされていない限り、誰でも任意の合言葉で自己登録 → ログイン成功となります。

## 恒久対策（必須手順）

### 1. `config/current` ドキュメントを作成・確認

Firebase Console → Firestore Database → データ → コレクション `config` → ドキュメント `current` に、
フィールド `value`（string 型）で **購入者に配布する合言葉** が入っていることを確認。

本プロジェクトの現行値（2026-04-15 時点）: `value = "ClickDesigntool"`

※ skills ドキュメント (`firebase_auth_skills.md`) では `secrets/current` と記載されていますが、実運用は `config/current` です。

### 2. セキュリティルールをデプロイ

このリポジトリには既に `firestore.rules` / `firebase.json` が含まれています。

**方法A: Firebase CLI（推奨）**

```bash
# 一度だけ: CLI インストールとログイン
npm install -g firebase-tools
firebase login

# この clickdesign1.2 ディレクトリで実行
cd "/Users/ryonri/Desktop/(納品用)テンプレート集/ClickDesign/clickdesign1.2"
firebase use clickdesign-login
firebase deploy --only firestore:rules
```

**方法B: Firebase Console から手動**

1. Firebase Console → Firestore Database → **ルール** タブ
2. `firestore.rules` の内容を丸ごとコピーして貼り付け
3. 「公開」をクリック

### 3. 動作検証

デプロイ後、以下を順に確認：

| 操作 | 期待される挙動 |
|---|---|
| 未購入者が `register.html` で適当な合言葉を入力 | 「登録に失敗しました。合言葉が間違っているか…」エラー表示 |
| 購入者が正しい合言葉で登録 | 「登録が完了しました」表示 + ログインリンク送信 |
| ログインリンククリック | `index.html` でツール画面が表示される |
| 登録済みメールで `index.html` から再度ログイン | ログインリンク送信 → クリックでツール表示 |
| 未購入者が `index.html` で直接ログインリンク送信 | リンクは届くが、クリック後に「このメールアドレスは登録されていません」と表示されツール非表示 |

## すでに不正登録されたユーザーを削除する方法

ルール適用前にテストモードで登録された不要な `allowlist` ドキュメントがある場合：

1. Firebase Console → Firestore → コレクション `allowlist`
2. 不正登録されたメールのドキュメントを個別に削除

または CLI:

```bash
# Firestore 全 allowlist を一度確認してから消す場合は Node.js スクリプトで実施
```

## 合言葉を変更したい場合

`config/current` の `value` を更新するだけ。既存の購入者のログインには影響しません（ログインは allowlist の存在確認のみ）。新規登録者のみ新しい合言葉が必要になります。

## 本件で変更/追加したファイル

- `firestore.rules` — セキュリティルール本体（新規）
- `firestore.indexes.json` — インデックス定義（新規、空でOK）
- `firebase.json` — Firebase CLI 用の設定（新規）
- `FIRESTORE_SETUP.md` — 本手順書（新規）
- `register.html` — archive から復元（前回対応）
- `.htaccess` — `register.html` の 403 ブロックを削除（前回対応）
