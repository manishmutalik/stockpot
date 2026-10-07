import { Platform } from 'react-native';

/** The browser draws its own focus outline round a text field; the app draws its own card round it. Native ignores this. */
export const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;
