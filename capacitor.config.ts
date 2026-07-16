import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'jp.yojiro.sakelog',
  appName: 'SAKEログ',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'automatic'
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
