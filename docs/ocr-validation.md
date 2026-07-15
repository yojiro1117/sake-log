# OCR Validation

Google Drive folder `1d3XLdTF1Z52n1tHumGqeJEY68gAy6ESr`の実画像151枚を2026-07-15に検証しました。画像本体とコンタクトシートはGit管理外の一時領域だけで使用し、リポジトリにはメタデータ、SHA-256、EXIF、OCR、信頼度、時間、警告・エラーだけを保存します。

## Dataset

| Item | Count |
| --- | ---: |
| Total | 151 |
| HEIC/HEIF | 131 |
| JPEG | 20 |
| Unique SHA-256 | 150 |
| Confirmed / partial / unknown ground truth | 48 / 15 / 88 |

表ラベル、裏ラベル、ボトル全体、棚、複数瓶、反射、暗所、ぼけ、斜め、縦書き、筆文字、日本語英語混在を含みます。正解不明画像は完全一致率の分母へ含めません。

## OCR paths

アプリはTextDetectorを高速経路として試し、未対応、空、低信頼度、識別文字不足の場合にdynamic importしたTesseract.js `jpn+eng` workerへフォールバックします。進捗・キャンセル・worker terminateに対応し、1枚の失敗でキュー全体を止めません。

検証では同じTesseractモデルで、結果が弱い画像だけ次の前処理へ進めました。

1. Orientation補正後、1000pxへ縮小、PSM 11。
2. 中央ラベルcrop、グレースケール、コントラスト、1100px、PSM 6。
3. 広いラベル帯crop、1200px、PSM 6。前経路と信頼度・文字数・候補数・ノイズを比較。

## Three OCR cycles

| Cycle | Text hit | Catalog candidate hit | Average | Maximum |
| --- | ---: | ---: | ---: | ---: |
| 1 | 100.0% | 5.3% | 1,214ms | 4,611ms |
| 2 | 100.0% | 6.0% | 2,392ms | 9,555ms |
| 3 | 100.0% | 7.3% | 2,874ms | 15,892ms |
| Final integrated | 100.0% | 8.6% | 6,479ms | 27,039ms |

文字取得率は高い一方、商品候補へ結びつく率は低く、OCR単独では不十分です。背景文字、蔵元だけの一致、棚の別商品、筆文字、縦書き、曲面、反射が主な失敗原因でした。この結果が、バーコード・構造化カタログ・複数写真・確認済み視覚参照・履歴を統合する設計根拠です。

## HEIC and EXIF

- HEIC conversion: 131/131 (100%)
- EXIF captured date: 136/151 (90.1%)
- Date priority: DateTimeOriginal, DateTimeDigitized, CreateDate, DateTime
- ファイル更新日時を撮影日として断定しない
- `capturedAt`と`drankAt`は分離し、明示ボタンでのみ反映する

Node検証は`heic-convert`、ブラウザ本体は直接decode後に`heic2any`フォールバックを使用します。変換失敗はファイル単位のエラーにして残りを継続します。

## Load observations

- Peak desktop RSS: about 1,300MB
- 151 images processed sequentially: 1,773 seconds
- The first validation attempt used the wrong temporary directory and failed in summary aggregation. The path was corrected and all 151 images were rerun successfully.
- Tesseract emitted small-text and extraneous-JPEG-byte warnings on some images; processing continued and warnings are retained per image.

iPhone Safari実機とAndroid Chrome実機はこの環境から操作できないため、PlaywrightのiPhone/Android相当WebKit/Chromium、375px/390px、production buildで代替します。端末本体の熱・メモリは未測定です。この実測から、アプリは最大10枚、同時実行1、低品質時のみ再解析を採用します。

## Alternative methods tried

- TextDetector fast path and Tesseract fallback
- Three preprocessing/PSM variants
- Manual crop, rotation, vertical, Latin-priority reanalysis
- BarcodeDetector then ZXing with 0/90/180/270 degree attempts
- Legacy dHash/color and composite aHash/pHash/color/edge/layout comparison
- Exact/alias/n-gram/Levenshtein catalog retrieval

The composite visual threshold 0.78 increased false positives without increasing Top-1. It was rejected and recalibrated to 0.84. Visual evidence remains auxiliary.

## Adopted behavior

OCR text and candidates are editable. No result is automatically confirmed. If no grounded candidate survives calibration, the UI displays that the brand could not be identified and asks for manual input. Fixed famous-brand fallbacks are not used.

Raw results: `tests/results/ocr-cycle-1.json`, `ocr-cycle-2.json`, `ocr-cycle-3.json`, `ocr-final.json`. Identification results: `identification-cycle-1.json` through `identification-cycle-6.json` and `identification-holdout-final.json`.
