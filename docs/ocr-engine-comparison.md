# OCR方式比較

- TextDetector: ブラウザが提供する場合だけ高速経路として使用。Node検証環境では利用不可だったため、結果空・低信頼時は必ずTesseractへ移る。
- Tesseract.js `jpn+eng`: 72枚で文字取得100%。原画像、中央ラベル、ラベル帯の3経路統合を採用。
- 高解像度8経路: 20分で40/72枚のため通常経路には不採用。低信頼度時の手動再解析候補として残した。

TextDetector非対応を無言の失敗にせず、Tesseract.jsをdynamic importし、進捗・キャンセル・worker terminateを実装した。
