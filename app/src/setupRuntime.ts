// React Native exposes this runtime polyfill but does not publish a declaration for the internal path.
// @ts-expect-error internal React Native polyfill
import RNFormData from 'react-native/Libraries/Network/FormData';

const runtimeGlobal = globalThis as typeof globalThis & {
  FormData?: typeof RNFormData;
};

runtimeGlobal.FormData ??= RNFormData;
