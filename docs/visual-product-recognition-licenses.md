# Local Label Image Product Retrieval: licenses

SAKE Log performs image retrieval on the device without sending photos to an external recognition service. It uses no paid API, billing account, or custom server.

| Component | Platform | License / terms | Model weights | Network at inference |
| --- | --- | --- | --- | --- |
| SAKE local label composite fingerprint | PWA / iOS / Android | Project source code (MIT) | None | None |
| Apple Vision (`VNRecognizeTextRequest`, `VNDetectBarcodesRequest`, `VNGenerateImageFeaturePrintRequest`) | iOS | Apple platform SDK terms | OS supplied; not redistributed | None |
| ML Kit bundled Japanese/Latin text recognition 16.0.1 | Android | Google ML Kit SDK terms; bundled artifact | Bundled by official dependency | None |
| ML Kit bundled barcode scanning 17.3.0 | Android | Google ML Kit SDK terms; bundled artifact | Bundled by official dependency | None |
| Tesseract.js 6 | PWA fallback | Apache-2.0 | Traineddata is loaded for local OCR | Model download/cache only; photos are not sent |

## Deliberately not bundled

MobileNet, EfficientNet, CLIP, ONNX Runtime and TensorFlow Lite image embedding weights are not in the production bundle. No candidate model was added without a verified redistributable weight license and a ground-truth holdout improvement. The app therefore identifies only built-in catalog products with grounded JAN/text evidence and products for which the user has confirmed local reference labels.

Reference product photos from the internet are not collected or redistributed. User-confirmed photos and their derived fingerprints remain in that user's IndexedDB.
