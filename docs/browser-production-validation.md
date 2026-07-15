# Browser production validation

The quality baseline is the browser implementation (`heic2any`, ExifReader, Canvas, Tesseract.js), not the Node helper implementation. CI serves the already-built `dist` only inside the GitHub runner; this is not a user-PC development server.

Projects: WebKit iPhone 13, Chromium Pixel 5, 375px iPhone SE, and 430px Android. The Drive-image test is split between WebKit and Chromium so 20 real files are processed once, not repeated across every viewport.

The post-deploy smoke test checks the public Pages URL and visible build hash. Physical iPhone and Android operation is not claimed by automation; results can be exported from the in-app device validation mode.

