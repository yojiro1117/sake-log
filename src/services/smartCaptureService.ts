import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import type { IdentificationPhotoType } from '../types';
import { getVisionAdapter } from '../platform/visionAdapter';
import type { NativeImageAnalysis } from '../platform/visionTypes';

export interface SmartCaptureResult {
  localFileUri: string;
  webPath: string;
  photoType: IdentificationPhotoType;
  warnings: string[];
  analysis: NativeImageAnalysis;
}

export async function captureLabelPhoto(photoType: IdentificationPhotoType): Promise<SmartCaptureResult> {
  if (!Capacitor.isNativePlatform()) throw new Error('ラベルスキャンはiOS/Androidアプリで利用できます。Web版では写真選択を使用してください。');
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    direction: CameraDirection.Rear,
    quality: 92,
    correctOrientation: true,
    saveToGallery: false
  });
  if (!photo.path || !photo.webPath) throw new Error('撮影画像の一時ファイルを取得できませんでした。');
  const analysis = await getVisionAdapter().analyzeImage({ localFileUri: photo.path, photoType, passes: ['label'] });
  const warnings = [...analysis.imageQuality.warnings];
  if (analysis.imageQuality.blurScore < 0.35) warnings.push('手ぶれしています。端末を固定して撮り直してください。');
  if (analysis.imageQuality.glareScore > 0.55) warnings.push('反射を避けて少し斜めから撮影してください。');
  if (analysis.imageQuality.labelCoverage < 0.2) warnings.push('ラベル全体を枠内へ大きく入れてください。');
  return { localFileUri: photo.path, webPath: photo.webPath, photoType, warnings, analysis };
}
