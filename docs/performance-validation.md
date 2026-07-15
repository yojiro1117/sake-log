# Performance Validation

- Dataset: 151 images, processed sequentially.
- OCR average: 6,479ms/image.
- OCR maximum: 27,039ms/image.
- OCR p50 / p95 from identification records: approximately 5.4s / 15.6s on validation.
- Peak Node validation RSS: about 1.3GB.
- Full OCR validation wall time: 1,773 seconds.
- Composite visual extraction wall time: 367 seconds before threshold recalibration.

Production constraints derived from these measurements: maximum 10 selected files, concurrency 1, first image first, adaptive retry only for weak OCR, cancellation, per-file failure continuation, worker termination, object URL revocation, and no eager model load.

Playwright WebKit/Chromium emulate iPhone/Android widths, but physical-device heat, memory pressure, and camera/photo-library integration remain manual release checks.
