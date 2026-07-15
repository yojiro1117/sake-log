# Ground Truth Method

The 151 images are split by product group into tuning (88), validation (30), and sealed holdout (33). Images from the same known product group do not cross splits.

Ground truth is propagated only from previous human review by exact Drive ID or SHA-256. Current totals are 48 confirmed, 15 partially confirmed, and 88 unknown. Unknown images remain outside exact-product accuracy denominators. Multi-product shelves and images whose visible label cannot support one product are not assigned guessed answers.

The manifest records `groundTruthStatus`, confirmation method, expected fields when known, and split. Any future correction must be a reviewed data change, not an algorithm-generated label.
