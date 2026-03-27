import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import '@/assets/ui.css';
import { PopupApp } from '@/features/popup/popup-app';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Popup root element was not found');
}

ReactDOM.createRoot(root).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
