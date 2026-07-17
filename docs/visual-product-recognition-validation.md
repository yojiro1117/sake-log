# Local label image product retrieval validation

## Dataset boundary

- Drive rescan: 151 files (131 HEIF, 20 JPEG)
- Image bytes are excluded from Git and CI artifacts.
- Ground truth status: 48 confirmed, 15 partially confirmed, 88 unknown; 120 product groups across tuning (88), validation (30), and sealed holdout (33).
- Exact-product metrics use only confirmed records with an expected product. Unknown records are excluded from accuracy denominators and remain useful for false-candidate and abstention checks.

## Improvement cycles

| Cycle | Change | Verification | Result |
| --- | --- | --- | --- |
| 0 | 0.6 baseline | 151-image OCR run | Text hit 100%; product ground truth unavailable; unsafe candidate overmatch identified |
| 1 | Label region before OCR | Unit/integration tests and corpus metadata review | Crop-first path used; full image remains fallback |
| 2 | aHash/dHash/pHash, color, edge and layout composite | Deterministic fingerprint tests | Composite retained; no external model added |
| 3 | Native compact embedding boundary | Contract and model checks | Model/version now explicit; incompatible spaces are rejected |
| 4 | Versioned catalog and local references | Catalog integrity and DB migration | Built-in and user-confirmed data remain separate |
| 5 | Exact image, JAN, visual and OCR union | Empty-OCR retrieval tests | Exact image and JAN can retrieve independently of OCR |
| 6 | Multi-photo evidence | Integration suite | Multiple photo evidence remains in the single production pipeline |
| 7 | Save-success learning | Eligibility tests and deterministic reference keys | Only confirmed, suitable, fair/good references are stored after save |
| 8 | Automatic early retrieval and candidate-first UI | React/type/lint/build checks | Preview and image/JAN candidate search precede heavy OCR |

## Current measured image-processing results

From `tests/results/ocr-final.json`: HEIC conversion 131/131, OCR non-empty 151/151, EXIF capture date 136/151, mean 5,954 ms, maximum 26,203 ms, peak process RSS 1,313 MB in the desktop validation runner. These are PWA fallback measurements, not native-device Apple Vision or ML Kit product-accuracy measurements.

Strict post-processing abstained on 86.8% of all images and emitted a grounded catalog candidate on 13.2%. These all-corpus display rates are not accuracy rates; accuracy is reported only for confirmed denominators below.

The cycle-6 validation split has 6 exact-product records: Top-1/3/5 50.0%, high-confidence wrong 0, and false-positive rate 0. The sealed holdout has 17 exact-product records: Top-1/3/5 17.65%, brand-family accuracy 55.0%, false-positive rate 0, and abstention 66.67%. Cycle 4 multi-photo grouping improved validation Top-1 and Top-5 from 33.3% to 50.0%; cycles 5 and 6 did not improve those figures.

The stored visual multi-crop experiment covers 25 records: Top-1 8.0%, false-positive rate 0, abstention 92.0%. It is not used as a high-confidence automatic decision path. Three tuning/validation catalog variants were trialed and removed after they produced no metric improvement. Maker-only retrieval was removed and fuzzy product matching was tightened: the 151-image boundary check improved exact Top-1 from 10.4% to 12.5%, brand Top-1 from 20.6% to 22.2%, and known false candidates from 2 to 0; unknown candidate displays fell from 5 to 4.

## Remaining validation gate

Same-product/different-angle visual recall and second-capture improvement require confirmed reference/query pairs created by the production embedding model. The current built-in catalog intentionally contains no redistributed product image or third-party derived embedding, so first-use image-only retrieval is limited to exact local history and user-confirmed references. Physical iPhone and Android device stability must also be measured before claiming device performance targets.
