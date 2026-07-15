# Local Alcohol Product Identification Engine

SAKEログの銘柄識別は、画像を外部へ送らないブラウザ内の複合識別エンジンです。Google Lensそのものやクラウド画像検索は使用しません。

## Processing paths

1. **Fast**: EXIF補正、品質判定、TextDetector、バーコードを試す。
2. **Standard**: Tesseract.js `jpn+eng`、ラベル領域、複数前処理、構造化カタログ検索を行う。
3. **Deep**: 手動crop、縦書き／英字再解析、複数写真証拠、確認済み視覚参照、過去の確定履歴を統合する。

`identificationPipeline`が経路を選択し、`ocrEngineService`、`labelRegionService`、`barcodeService`、`visualFeatureService`、`candidateRetrievalService`、`candidateRankingService`、`confidenceCalibrationService`を調停します。候補は常に要確認で、自動確定しません。

## Privacy and persistence

- 元画像、OCR、特徴量、候補は端末内だけで処理する。
- 確認済み参照画像だけをIndexedDBへ学習データとして保存する。
- 学習イベントIDは `logId|imageHash|productId` とし、再実行を冪等にする。
- DB v6は既存データを維持して識別テーブルを追加する。
- 任意のGoogle Lens補助は、ユーザーが明示操作した画像書き出しだけで、自動送信しない。

## Safety

JAN完全一致、正式名、別名、蔵元、容量、度数、酒種、複数写真、視覚類似を独立した証拠として扱います。矛盾は減点し、根拠不足・候補差不足・未知商品は棄却します。SNS Feature FlagがOFFの間は生成・共有処理を呼びません。
