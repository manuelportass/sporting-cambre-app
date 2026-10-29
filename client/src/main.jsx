import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/ui';
import './styles.css';
import DemoBar from './demo/DemoBar';
import { registerSW } from './lib/push';

registerSW();

// En la versión de prueba la navegación vive en memoria (la página se abre dentro de Claude)
const Router = window.__scpfDemo ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <ToastProvider>{window.__scpfDemo && <DemoBar />}<App /></ToastProvider>
    </Router>
  </React.StrictMode>,
);
