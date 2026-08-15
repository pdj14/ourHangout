// React Native core globals must exist before Expo patches the runtime.
import 'react-native/Libraries/Core/InitializeCore';
import './src/setupRuntime';
import { registerRootComponent } from 'expo';
import App from './src/App';

registerRootComponent(App);
