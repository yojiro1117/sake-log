# Native vision validation

## Scope

Version 0.7.0 introduces a native-first image analysis boundary while preserving the PWA. This document distinguishes implemented code, automated compile validation, simulator validation, and physical-device validation. A successful WebKit test is never counted as an iPhone device result.

## Architecture

1. React requests `SakeVisionPlugin` through `src/platform/visionAdapter.ts`.
2. iOS uses Apple Vision/Core Image; Android uses on-device ML Kit plus local deterministic image processing.
3. Native observations retain text, confidence, normalized bounding boxes, pass IDs, region types, and engine names.
4. `aggregateNativeText` merges repeated observations without auto-confirming a product.
5. Barcode, text, history, corrections, multi-photo evidence, and visual evidence remain independent retrieval paths before union/ranking.
6. Unknown or weak results abstain and remain editable. They are not replaced by fixed famous-brand suggestions.

## Crop-first correction

The PWA path now performs label-region detection before the first Tesseract pass. It reads the strongest label crop first and analyzes the full image only when crop evidence is weak. TextDetector output and a single catalog hit no longer terminate analysis early. Multiple OCR outputs are normalized and merged.

## Automated checks

- TypeScript typecheck, ESLint, unit/integration/migration tests, PWA build, and production E2E remain in the Pages workflow.
- iOS is compiled for a generic iOS Simulator destination on a macOS runner.
- Android is compiled with JDK 21; Kotlin unit tests and `assembleDebug` run on Ubuntu.
- Contract checks require all JavaScript plugin methods and the expected Apple Vision/ML Kit API symbols.
- Model-boundary checks reject unreviewed `.tflite`, `.mlmodel`, `.onnx`, or similar binaries.

## Real-image validation boundary

The shared Google Drive folder was rescanned at the start of this change. It contained 151 images: 131 HEIF/HEIC and 20 JPEG. Those files remain outside Git. PWA results from the existing validation corpus are not reused as native OCR metrics.

Native iOS and Android OCR metrics require the corresponding native executable to process the images. CI compile success alone is not recorded as OCR success. A physical iPhone 12 mini is not available in the Codex environment, so physical-device results remain unverified until the in-app diagnostic JSON is exported from that device.

## Diagnostic mode

Settings -> App diagnostics exports environment, OCR engine, barcode engine, visual engine, model version, catalog version, thermal state when available, battery level when available, IndexedDB version, build hash, and recent image processing details. It excludes API keys, image bytes, comments, and full log text.

## Current validation cycles

| Cycle | Change | Automated evidence |
| --- | --- | --- |
| 0 | Existing PWA Tesseract baseline | Existing 151-file manifest and PWA validation artifacts |
| 1 | Apple Vision plugin and common observation contract | macOS Xcode simulator build plus contract check |
| 2 | Android ML Kit Japanese/Latin and barcode plugin | Gradle Kotlin tests plus debug APK build |
| 3 | Crop-first label analysis and no TextDetector early exit | TypeScript unit/integration tests and PWA build |
| 4 | Independent JAN/text/visual/history retrieval union | Existing identification tests plus native aggregation tests |
| 5 | Multi-pass observation merge and abstention | Native aggregation and candidate tests |
| 6 | Multi-photo common pipeline | Existing multi-photo integration coverage |
| 7 | Unknown-product and diagnostic storage schema | Dexie version 8 migration test |
| 8 | Reject one-character aliases and constrain fuzzy matching to OCR tokens | Candidate hit rate changed from an unsafe 91.4% to an abstention-first 13.2%; correctness remains unscored because confirmed ground truth is 0 |

Numeric native OCR accuracy, p50/p95, memory, thermal, and battery measurements are intentionally not filled from compile tests. They must come from an actual native run and exported diagnostic result.

## 151-image PWA rerun

| Metric | Result |
| --- | ---: |
| Total images | 151 |
| HEIC/HEIF | 131 |
| JPEG | 20 |
| HEIC conversion success | 100% (131/131) |
| EXIF captured-at extraction | 90.1% (136/151) |
| OCR non-empty | 100% |
| Candidate display after strict reassessment | 13.2% |
| No candidate / abstention | 86.8% |
| Average processing time | 5,954 ms |
| Maximum processing time | 26,203 ms |
| Peak process RSS | 1,313 MB |
| Per-image processing errors | 0 |

These are PWA/Tesseract validation results, not iOS Vision or Android ML Kit results. All 151 ground-truth records are currently `unknown`; therefore complete-match rate, partial-match rate, Top-1, Top-3, Top-5, and false-candidate count are not claimed. The raw image files are not committed.
