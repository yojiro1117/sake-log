# Barcode Validation

The production path first uses `BarcodeDetector` when available, then dynamic ZXing fallback. ZXing retries 0, 90, 180, and 270 degree rotations. Each result records engine, format, raw value, confidence, rotation, processing time, and warnings.

The Drive set contains rear labels and barcodes, but this Node image-validation run did not execute the browser BarcodeDetector implementation. Unit tests cover native success, fallback, rotation/cancellation boundaries, and no-result continuation. A detected value becomes strong identity evidence only when it matches a confirmed local product barcode. Unmapped values are shown for confirmation and never auto-create catalog mappings.
