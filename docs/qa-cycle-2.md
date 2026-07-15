# QA cycle 2

- Scope: real-image OCR records and candidate extraction.
- Input: 72 private Drive images, 58 HEIC/HEIF and 14 JPEG. Images were held only in a temporary directory.
- Baseline from raw records: text hit 100%, candidate extraction 8.3%, no candidate 91.7%.
- Cause: OCR often returned noisy text and the structured candidate master lacked labels visibly present in the test set.
- Changes: adaptive OCR stops after a sufficiently strong first pass; otherwise it compares up to four preprocessing variants. Added only visually confirmed aliases, never unrelated fallback labels.
- Recalculated result: meaningful text 75.0%, candidate extraction 22.2%, no candidate 77.8%.
- Ground truth: 14 of the representative 20 images were visually unambiguous and marked confirmed. Correct candidate included/top-1 was 35.7% on that confirmed subset; false candidates were 0.
- Interpretation: candidate recall improved, but 77.8% without a candidate remains a material failure rate.

