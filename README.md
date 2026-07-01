# SAKEログ

SAKEログは、飲んだお酒を写真付きで記録し、酒種別評価、レーダーチャート、コスパ評価、味覚傾向分析、料理ペアリング提案、SNS投稿文、SNS投稿画像をブラウザ内で生成する無料PWAです。

## 主な機能

- 初回起動時の20歳以上確認
- 下部タブ型UI（ホーム、記録、ログ、分析、設定）
- 日本酒、ワイン、焼酎、ビールの酒種別6軸評価
- Chart.jsによるレーダーチャート表示
- IndexedDB + Dexie.jsによる端末内保存
- 写真アップロード、リサイズ、Canvas投稿画像生成
- 外部AI APIを使わないローカル投稿文生成
- 楽天市場APIを使った市場価格候補検索の基本構造
- 価格取得失敗時の手入力フォールバック
- 価格帯と満足度に基づくコスパ評価
- ログ検索、酒種フィルタ、評価順、価格順、コスパ順
- 味覚傾向、酒種別平均評価、リピート傾向の簡易分析
- 投稿テンプレート編集
- Web Share APIによる共有、非対応環境ではコピー・画像保存
- ローカルJSONエクスポート
- Google Driveバックアップ後続実装に向けた `backupService` 分離

## 技術構成

- React
- TypeScript
- Vite
- Vite PWA
- Tailwind CSS
- IndexedDB
- Dexie.js
- Chart.js / react-chartjs-2
- Canvas API
- Web Share API

独自サーバー、外部DB、常時稼働バックエンド、有料API、外部AI APIは初期実装では使用していません。

## GitHub Pagesでの公開方法

このリポジトリはGitHub Pagesで公開できる静的PWAとして構成しています。Viteの `base` は `/sake-log/` に固定しています。

1. GitHubリポジトリの `Settings` を開きます。
2. `Pages` を開きます。
3. `Build and deployment` の `Source` を `GitHub Actions` に設定します。
4. `main` ブランチへpushするか、Actionsから `Build and Deploy GitHub Pages` を手動実行します。
5. 公開URL `https://yojiro1117.github.io/sake-log/` を開いて確認します。

`Source` が `GitHub Actions` になっていない場合、Pagesデプロイ時に `Get Pages site failed` や `HttpError: Not Found` が発生することがあります。初回公開前に必ずこの設定を確認してください。

`Build` は成功しているのに `Deploy` が `Failed to create deployment` で失敗する場合は、`Settings` → `Environments` → `github-pages` を開き、保護ルール、必須レビュー、branch制限が `main` からのGitHub Pagesデプロイを妨げていないか確認してください。

## GitHub Actionsによるビルド確認

`.github/workflows/deploy.yml` により、`main` ブランチへのpush時と手動実行時に以下を実行します。

- Node.jsセットアップ
- pnpmセットアップ
- `pnpm install --frozen-lockfile`
- `pnpm run lint`
- `pnpm run build`
- `dist` をGitHub Pagesへデプロイ

Actions画面で `Build and Deploy GitHub Pages` が成功していることを確認してください。

## セットアップ方法

通常の確認はGitHub ActionsとGitHub Pagesで行います。ローカルPCに作業データを残したくない場合は、ローカルで `install` や `dev` を実行せず、GitHub上のActions結果とPages公開URLで確認してください。

```bash
pnpm install
pnpm run dev
```

## 開発コマンド

```bash
pnpm run dev
pnpm run lint
pnpm run build
pnpm run preview
```

## ビルド方法

```bash
pnpm run build
```

ビルド成果物は `dist` に出力されます。GitHub Actionsではこの `dist` がGitHub Pagesにデプロイされます。

## PWA確認方法

GitHub Pages公開URL `https://yojiro1117.github.io/sake-log/` を開き、ブラウザのDevToolsでManifestとService Workerを確認します。スマホでは公開URLから「ホーム画面に追加」を使ってインストール挙動を確認できます。

## データ保存方式

データは原則として各端末のIndexedDBに保存します。Dexie.jsで以下のストアを定義しています。

- `logs`
- `images`
- `userSettings`
- `templates`
- `personalityResults`
- `reviewProfileResults`
- `backupStatus`
- `priceCandidates`
- `externalSources`

端末内データはブラウザ設定やストレージ削除で消える可能性があります。設定画面のデータエクスポートからローカルJSONを書き出してください。

## 完全無料運用方針

- アプリ本体は静的PWAとして提供します。
- ホスティングはGitHub Pages Freeを想定します。Cloudflare Pages Freeにも移行可能な静的構成です。
- データ保存は各端末のIndexedDBを基本にします。
- 投稿文生成は外部AI APIを使わず、テンプレートと評価結果からローカル生成します。
- レーダーチャートとSNS投稿画像はブラウザ内で生成します。
- 市場価格取得は楽天市場APIを主軸にします。
- 楽天アプリIDは設定画面で入力し、本人の端末内に保存します。
- APIキー秘匿用の独自サーバーは初期実装では用意しません。
- 外部DB、独自サーバー、Firebase、有料API、外部AI APIは導入しません。

## 楽天アプリIDの設定方法

設定タブの「楽天アプリID」に、楽天ウェブサービスで取得したApplication IDを入力して保存してください。IDは端末内のIndexedDBに保存されます。価格検索に失敗した場合でも、手入力または過去登録データから補完できます。

## 後続実装メモ

### Google Driveバックアップ

Google Driveバックアップは後続実装です。想定保存先は以下です。

```text
Google Drive
└─ SAKEログ_Backup
   ├─ logs
   │  ├─ sake_logs.json
   │  └─ sake_logs.csv
   ├─ images
   │  ├─ originals
   │  └─ posts
   ├─ charts
   ├─ templates
   └─ settings
```

初期実装では `src/services/backupService.ts` にローカルエクスポートを分離し、Google Drive API連携を追加しやすい構造にしています。

### Amazon公式API連携

Amazon価格取得は初期非対応です。将来、公式API利用条件を満たした場合のみ、楽天検索とは別の外部ソースとして `priceService` に追加してください。

### SNS直接投稿API連携

SNS直接投稿は初期非対応です。生成した投稿文と投稿画像をWeb Share API、コピー、画像保存で各SNSアプリに渡す方式です。

## 注意事項

- このアプリは酒類の記録用です。20歳未満の飲酒を助長する目的では使用できません。
- 投稿文生成では、飲酒運転、一気飲み、過度な飲酒、酔いつぶれる表現を避ける方針です。
- 「お酒は20歳になってから」を必要に応じて表示・投稿文に含めます。
- OCR、バーコード取得、高精度な市場価格正規化は今後の拡張対象です。
- 初期MVPの市場価格取得は候補表示と手入力フォールバックを重視しています。
