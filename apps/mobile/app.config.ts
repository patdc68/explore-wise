import type { ExpoConfig } from 'expo/config';
import baseConfig from './app.json';
const config = baseConfig.expo as ExpoConfig;
export default (): ExpoConfig => {
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const mapsPlugin: [string, any][] = androidGoogleMapsApiKey ? [['react-native-maps', { androidGoogleMapsApiKey }]] : [];
  return { ...config, plugins: [...(config.plugins ?? []), ...mapsPlugin] };
};
