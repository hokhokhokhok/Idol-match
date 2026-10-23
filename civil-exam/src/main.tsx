import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/question.css';
import './styles/app.css';
import { App } from './App';

registerSW({ immediate: true });
// 기록이 기기에만 있으므로 브라우저가 저장공간을 임의로 비우지 않도록 요청 (지원 브라우저만)
navigator.storage?.persist?.().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
