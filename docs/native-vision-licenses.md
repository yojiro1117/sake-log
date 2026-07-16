# Native vision dependencies and license boundary

## Included platform APIs

- iOS uses Apple Vision and Core Image supplied by iOS. No model file is bundled by this repository.
- Android uses the bundled Google ML Kit Text Recognition v2 Japanese/Latin artifacts and Barcode Scanning artifacts from Google's Maven repository. Recognition executes on the device and the app does not upload label images.
- Android label-region detection and visual fingerprints are application-owned deterministic image processing. OpenCV and third-party model weights are not included.

## Distribution boundary

The product catalog contains factual text metadata maintained by this project. It contains no copied label photographs. Reference images may be created only from a user's own confirmed images and remain in that user's IndexedDB/native application storage.

`scripts/check-native-models.mjs` fails CI if an unreviewed model binary is added. Dependency and platform terms still need to be reviewed before store submission; this check does not replace legal review.
