import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Toaster } from 'sonner';
import { NotificationPortal } from './components/common/NotificationPortal';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <NotificationPortal><Toaster position="top-right" richColors closeButton /></NotificationPortal>
    </ErrorBoundary>
  </StrictMode>,
);

