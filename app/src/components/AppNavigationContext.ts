import { createContext } from 'react';
export const AppNavigationContext = createContext<{ onSettings?: () => void; onBack?: () => void }>({});
