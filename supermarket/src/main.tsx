import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { NotifyProvider } from './contexts/NotifyContext';
import './index.css';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <NotifyProvider>
        <App />
      </NotifyProvider>
    </AuthProvider>
  </React.StrictMode>
);