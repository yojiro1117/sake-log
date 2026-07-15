# Local Identification Licenses

| Component | Purpose | License |
| --- | --- | --- |
| Tesseract.js | Browser OCR | Apache-2.0 |
| ExifReader | EXIF parsing | MPL-2.0 |
| heic2any | Browser HEIC conversion | MIT |
| @zxing/browser | Barcode fallback | MIT |
| Dexie.js | IndexedDB | Apache-2.0 |
| Jimp | Development image validation only | MIT |
| heic-convert | Development HEIC validation only | ISC |

TextDetector and BarcodeDetector are optional browser APIs and add no package. OpenCV.js/ONNX Runtime were not added: the current 151-image set did not justify their bundle and memory cost, and the handcrafted visual comparison did not improve accuracy at the original threshold. No model or library with noncommercial-only terms is used.
