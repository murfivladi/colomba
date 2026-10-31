import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/old-standard-tt/cyrillic-400.css';
import '@fontsource/old-standard-tt/latin-400.css';
import '@fontsource/old-standard-tt/cyrillic-700.css';
import '@fontsource/old-standard-tt/latin-700.css';
import '@fontsource/caveat/cyrillic-400.css';
import '@fontsource/caveat/latin-400.css';
import '@fontsource/marck-script/cyrillic-400.css';
import '@fontsource/marck-script/latin-400.css';
import '@fontsource/bad-script/cyrillic-400.css';
import '@fontsource/bad-script/latin-400.css';
import '@fontsource/neucha/cyrillic-400.css';
import '@fontsource/neucha/latin-400.css';
import '@fontsource/amatic-sc/cyrillic-400.css';
import '@fontsource/amatic-sc/latin-400.css';
import './styles.css';
import { App } from './App';
import { applyTheme, getTheme } from './screens/Settings';

applyTheme(getTheme());
if ('serviceWorker' in navigator) registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
