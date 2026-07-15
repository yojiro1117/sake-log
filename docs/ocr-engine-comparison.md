# OCR Engine Comparison

- TextDetector: optional browser-native fast path; unavailable in many Safari/Firefox environments, so never the sole path.
- Tesseract.js `jpn+eng`: required dynamic-import worker fallback; 151/151 images returned text in Node validation.
- Tesseract preprocessing variants: base PSM11, center-label gray/contrast PSM6, and label-band PSM6. Candidate-hit rate improved 5.3% -> 6.0% -> 7.3%; integrated result was 8.6%.
- High-cost exhaustive preprocessing was not adopted as the default because the full adaptive run already took 1,773 seconds and peaked near 1.3GB RSS.

OCR remains one signal. Barcode, catalog structure, multiple photos, confirmed visual references, and user corrections provide independent evidence.
