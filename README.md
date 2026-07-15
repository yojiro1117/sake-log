# SAKEログ

SAKEログは、お酒を写真・評価・コメントで記録し、味覚傾向やコスパを端末内で分析する無料PWAです。現在の公開版は「お酒の記録アプリ」として提供し、SNS投稿支援機能は後日拡張予定です。

## 主な機能

- 20歳以上確認
- スマホファーストの下部タブUI
- 今日のお酒を記録
- 写真から記録
- 複数写真のインポート
- 1つのお酒に複数写真を紐付けるモード
- 写真ごとに別ログとして登録するモード
- EXIF/メタデータから撮影日を取得
- capturedAt（写真撮影日）とdrankAt（飲酒日）の分離保存
- 撮影日を飲酒日に設定するボタン
- Tesseract.jsによるブラウザ内OCR
- TextDetector対応環境では高速OCRを先に試行
- OCR失敗時の手入力フォールバック
- 酒種別6軸評価とレーダーチャート
- 市場価格候補の検索、手入力、過去登録価格フォールバック
- 選択した市場価格候補の保存
- 高評価ランキング、コスパランキング
- IndexedDB + Dexie.jsによる端末内保存
- Dexieトランザクションによるログ・画像・価格候補の一括保存
- 重複登録警告
- 入力途中の自動保存と複数ドラフト復元
- 「あとで編集」記録と未完成ログ管理
- 根拠別OCR・候補信頼度表示
- 構造化銘柄カタログ、英字名・表記ゆれ・OCR誤認識補正
- JAN/EAN読取（BarcodeDetector、ZXingフォールバック）
- ユーザー確認済み写真だけを使う端末内視覚照合
- OCR、バーコード、構造化カタログ、複数写真、確認済み視覚参照を統合するローカル銘柄識別
- ラベル範囲の手動指定、回転、縦書き・英字優先の再解析
- OCR修正辞書と写真分類修正履歴
- 写真の自動分類候補（必ずユーザー確認）
- 機密情報を除外したアプリ診断
- ローカルJSONエクスポート

## 技術構成

- React
- TypeScript
- Vite
- Vite PWA
- Tailwind CSS
- IndexedDB
- Dexie.js
- Chart.js / react-chartjs-2
- Tesseract.js
- ExifReader
- heic2any
- Vitest

独自サーバー、外部DB、Firebase、有料API、外部AI APIは使用しません。

## GitHub Pagesでの公開方法

このリポジトリはGitHub Pagesで公開できる静的PWAとして構成しています。Viteの `base` は `/sake-log/` です。

1. GitHubリポジトリの `Settings` を開く
2. `Pages` を開く
3. `Build and deployment` の `Source` を `GitHub Actions` に設定する
4. `main` ブランチへpushする、またはActionsから `Build and Deploy GitHub Pages` を手動実行する
5. 公開URL `https://yojiro1117.github.io/sake-log/` を確認する

`Source` が `GitHub Actions` になっていない場合、Pagesデプロイ時に `Get Pages site failed` や `HttpError: Not Found` が発生することがあります。

`Deploy` が `Failed to create deployment` で失敗する場合は、`Settings` → `Environments` → `github-pages` を開き、保護ルール、必須レビュー、branch制限が `main` からのGitHub Pagesデプロイを妨げていないか確認してください。

## GitHub Actionsによる確認

`.github/workflows/deploy.yml` により、`main` ブランチへのpush時と手動実行時に以下を実行します。

- Node.js 22 setup
- pnpm setup
- `pnpm install --frozen-lockfile`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run test`
- `pnpm run test:integration`
- `pnpm run build`
- `dist` をGitHub Pagesへデプロイ
- デプロイ後にiPhone/Android相当の`pnpm run test:e2e`

いずれかの検証が失敗した場合、デプロイは実行されません。

## セットアップ方法

通常の確認はGitHub ActionsとGitHub Pagesで行います。ユーザーPCに作業データを残したくない場合は、ローカルで `install` や `dev` を実行せず、GitHub上のActions結果とPages公開URLで確認してください。

```bash
pnpm install
```

## 開発コマンド

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

ローカル開発サーバーを使う場合のコマンドは `pnpm run dev` ですが、この運用ではlocalhost確認を前提にしません。

## PWA確認方法

GitHub Pages公開URL `https://yojiro1117.github.io/sake-log/` を開き、ブラウザのDevToolsでManifestとService Workerを確認します。スマホでは公開URLからホーム画面追加を確認します。

設定画面の「アプリ情報」に以下を表示します。

- Version
- Build
- Build time

GitHub Actionsの最新commitと画面上のBuildが一致していれば、GitHub Pagesに最新ビルドが反映されています。

## データ保存方式

データは各端末のIndexedDBに保存します。Dexie.jsで以下のストアを定義しています。

- `logs`
- `images`
- `userSettings`
- `templates`
- `personalityResults`
- `reviewProfileResults`
- `backupStatus`
- `priceCandidates`
- `externalSources`
- `productCatalog`
- `referenceImages`
- `identificationRuns`
- `learningEvents`
- `productAliases`
- `productBarcodes`
- `visualFeatures`
- `identificationEvidence`
- `identificationSettings`

ログ保存時は `logs`、`images`、`priceCandidates` をDexieトランザクションで一括保存します。途中で失敗した場合はロールバックされ、画像だけ、ログだけ、価格候補だけが残らないようにしています。

## 写真インポート

ホーム画面の「写真から記録する」または記録画面の写真選択から、スマホの写真ライブラリやPC内の画像を選択できます。一度に処理できる写真は最大10枚です。

複数写真を選んだ場合は、以下のどちらかを選択します。

- 1つのお酒に複数写真を追加する
- 写真ごとに別のお酒として登録する

写真ごとに別ログとして登録する場合、次の写真へ進む前にフォーム状態、OCR結果、価格候補、評価値、保存状態を初期化します。

## EXIF・撮影日

ExifReaderで取得可能な撮影日を `capturedAt` として保存します。`capturedAt` が取得できた場合は「撮影日を飲酒日に設定」ボタンで `drankAt` に反映できます。EXIFがない場合、撮影日は未設定として扱い、今日の日付を撮影日として断定しません。

## OCR

OCRはブラウザ内で実行します。初回画面表示時には読み込まず、OCR実行時にTesseract.jsを動的importします。

- TextDetectorが利用可能な場合は先に高速OCRを試行
- TextDetectorが未対応または結果が不十分な場合はTesseract.jsへフォールバック
- 元画像、Orientation補正、中央切り出し、拡大グレー、コントラスト、二値化、シャープ化の複数パターンを比較
- 対象言語は日本語と英語
- OCR進捗率を表示
- キャンセル可能
- OCR失敗時は手入力へ誘導
- OCR結果がない場合、固定の有名銘柄候補は表示しません

OCRは必ず実行する構造ですが、写真の状態、端末性能、ブラウザ制限により100%正確な銘柄特定は保証できません。候補は自動確定せず、ユーザー確認を必須にしています。

OCR改善の反復検証は `docs/ocr-validation.md` に記録しています。Google Driveの実画像151枚を検証し、画像本体はGitHubへ保存せず、ファイル名、MIME、サイズ、SHA-256、EXIF、OCR結果、信頼度、処理時間、成否のみをマニフェストと `tests/results/ocr-*.json` に保存しています。

検証結果の概要:

- 対象: 151枚
- 内訳: HEIC/HEIF 131枚、JPEG 20枚
- HEIC変換成功率: 100%
- OCR文字取得率: 100%
- EXIF撮影日取得率: 90.1%
- 平均処理時間: 6,479ms
- 最大処理時間: 27,039ms
- ホールドアウトのブランド系列一致率: 30.0%
- ホールドアウトの製品完全一致Top1: 0.0%
- ホールドアウトの誤候補率: 0%

銘柄特定は、OCR、構造化カタログ、メーカー・容量・度数、複数写真、JAN/EAN、確認済み参照写真を根拠別に統合します。候補には一致理由、不一致理由、信頼度を表示し、常にユーザー確認を必要とします。未登録銘柄や証拠不足時は無関係な固定候補を出さず、未特定として手入力できます。カタログは設定画面から検索、編集、非表示、JSON入出力が可能です。

## 対応画像形式

- JPEG / JPG
- PNG
- WebP
- HEIC / HEIF

HEIC/HEIFはheic2anyでブラウザ内JPEG変換を試みます。変換できない場合は、iPhone側で「互換性優先」にするかJPEGへ変換してから選択する案内を表示します。

## 市場価格取得

楽天市場APIを主軸に価格候補を取得します。楽天アプリIDは設定画面で入力し、本人の端末内に保存します。APIキー秘匿用の独自サーバーは用意しません。

価格候補は自動採用しません。候補ごとに以下を保存します。

- 一意ID
- 取得元
- 商品名
- ショップ名
- 商品URL
- 価格
- 送料情報
- 容量
- 本数
- 一致度
- 一致理由
- 除外理由
- 推奨フラグ

楽天APIで取得できない場合は、過去登録データ、手入力、未取得保存の順にフォールバックします。

## 完全無料運用方針

- アプリ本体は静的PWAとして提供
- ホスティングはGitHub Pages Freeを想定
- データ保存は各端末のIndexedDB
- 外部DB、Firebase、独自サーバーは使用しない
- 有料API、外部AI APIは使用しない
- OCRと画像処理は可能な範囲でブラウザ内実行
- 楽天アプリIDは本人の端末内に保存
- APIキーや秘密情報をGitHubへcommitしない

## 後続実装メモ

### Google Driveバックアップ

Google Driveバックアップは後続実装です。初期実装では `src/services/backupService.ts` にローカルエクスポートを分離し、Google Drive API連携を追加しやすい構造にしています。

```text
Google Drive
└─ SAKEログ_Backup
   ├─ logs
   │  ├─ sake_logs.json
   │  └─ sake_logs.csv
   ├─ images
   │  ├─ originals
   │  └─ records
   ├─ charts
   ├─ templates
   └─ settings
```

### Amazon公式API連携

Amazon価格取得は初期非対応です。将来、公式API利用条件を満たした場合のみ、楽天検索とは別の外部ソースとして `priceService` に追加します。

### SNS投稿支援機能

SNS投稿支援機能は後日拡張予定です。現在のユーザー画面には、SNS連携、SNS直接投稿、共有、投稿文生成、投稿画像生成の操作UIは表示しません。Feature FlagがOFFの間は内部生成処理も実行しません。

## 注意事項

- このアプリは酒類の記録用です。20歳未満の飲酒を助長する目的では使用できません。
- 飲酒運転、一気飲み、過度な飲酒を助長する表現は避けます。
- 端末内データはブラウザ設定やストレージ削除で消える可能性があります。必要に応じてエクスポートしてください。
- OCR、バーコード取得、市場価格の完全自動取得は保証しません。誤登録を防ぐため、候補は必ず確認してから保存してください。

## 品質検証とリリース条件

ローカルバックアップはJSON単体ではなく、画像・編集中ドラフト・価格候補・設定・学習履歴を含むチェックサム付きZIPです。復元前にSHA-256を検証し、統合または置換を選べます。

Google Driveの実画像151枚（HEIC/HEIF 131枚、JPEG 20枚）について、OCR、HEIC、EXIF、候補抽出、視覚照合を反復検証しています。画像本体はGitHubへ保存していません。

- OCR文字取得率: 100%
- 銘柄候補抽出率: 8.6%
- 候補なし: 91.4%
- ホールドアウトブランド系列一致率: 30.0%
- ホールドアウト製品Top-1: 0.0%
- ホールドアウト誤候補率: 0.0%
- HEIC変換成功率（Node補助検証）: 100%
- EXIF撮影日取得率: 90.1%
- 平均処理時間: 6,479ms
- 最大処理時間: 27,039ms

文字を1文字以上取得しただけでは銘柄特定成功とは扱いません。正解値を目視で確定できない画像は `groundTruthStatus: unknown` とし、銘柄正解率の分母から除外します。候補抽出率と製品Top-1は不十分であり、無関係候補を出す代わりに棄却し、確認済みローカル学習で改善します。

GitHub Actionsはinstall、typecheck、lint、unit test、integration test、銘柄ベンチマーク、buildの後、デプロイ前にproduction `dist` をWebKitとChromiumで検証します。151枚全体は保存済み実測結果で評価し、ブラウザE2Eでは代表HEIC/JPEGを本番と同じfile inputで渡します。このQAが失敗した場合はGitHub Pagesへデプロイしません。デプロイ後は公開URLのsmoke testを実行します。

詳細は `docs/qa-cycle-1.md`、`docs/qa-cycle-2.md`、`docs/qa-cycle-3.md`、`docs/browser-production-validation.md` を参照してください。
