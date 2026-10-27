import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { NotifyProvider } from './contexts/NotifyContext';
import './index.css';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      {/* The app's own notifications and confirm dialog, available everywhere. */}
      <NotifyProvider>
        <App />
      </NotifyProvider>
    </AuthProvider>
  </React.StrictMode>
);