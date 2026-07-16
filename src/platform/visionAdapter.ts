import { Capacitor } from '@capacitor/core';
import type { SakeVisionPlugin } from './visionTypes';
import { nativeVisionAdapter } from './nativeVisionAdapter';
import { webVisionAdapter } from './webVisionAdapter';

export function getVisionAdapter(): SakeVisionPlugin {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SakeVision')
    ? nativeVisionAdapter
    : webVisionAdapter;
}

export async function getVisionEnvironment() {
  return getVisionAdapter().getCapabilities();
}
