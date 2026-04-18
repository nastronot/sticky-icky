import { createContext } from 'react';

// Pattern registry context. Lets the per-layer controls that render
// PatternPicker stay unaware of the registry / modal triggers that live at
// the App level. Kept in its own module so PatternPicker.jsx only exports
// components (satisfies react-refresh/only-export-components).
export const PatternContext = createContext({
  patterns: [],
  onCreatePattern: () => {},
  onManagePatterns: () => {},
});
