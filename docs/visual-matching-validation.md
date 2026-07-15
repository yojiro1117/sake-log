# Visual Matching Validation

All 151 Drive images decoded successfully for feature extraction. Evaluation used 15 repeated, reviewed product photos and tuning-only references.

- Legacy dHash + color, threshold 0.78: Top-1 6.7%, false positives 0%, abstention 93.3%.
- Composite dHash + aHash + local pHash + color + edge + layout, threshold 0.78: Top-1 6.7%, false positives 20.0%, abstention 73.3%.
- The 0.78 composite threshold was rejected.
- Recalibrated composite threshold 0.84: one correct match survived and no wrong match exceeded the threshold in this set.

Visual matching is therefore auxiliary only. References must be user-confirmed, and a visual score cannot automatically identify or learn a product.
