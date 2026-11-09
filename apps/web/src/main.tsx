import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessaoProvider } from './lib/sessao';
import { ToastProvider } from './components/ui';
import { Desfazer } from './components/Desfazer';
import App from './App';
import { instalarMascaras } from './lib/mascara';
import { instalarTabelas } from './lib/tabelas';
import './styles.css';
import './app.css';

instalarMascaras();
instalarTabelas();

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <SessaoProvider>
          <ToastProvider>
            <App />
            <Desfazer />
          </ToastProvider>
        </SessaoProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
