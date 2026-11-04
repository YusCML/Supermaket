// main.tsx: the starting point of the whole app.
//
// index.html has an empty <div id="root"> and loads this file. This file then
// draws the React app inside that div. Nothing else in the project calls it.
//
// It also:
//   - loads the Poppins font. The @fontsource packages ship the font files
//     inside the app, so no request goes out to Google Fonts. There is one
//     import per weight the app uses: 400 normal, 500 medium, 600 semibold,
//     700 bold and 800 extrabold.
//   - loads the global CSS: index.css (Tailwind + the colour names) and
//     App.css (the few rules Tailwind can't do, like receipt printing).
//   - wraps the app in two "Context providers" (explained further down).
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css'; // font-extrabold (big totals and headings)
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { NotifyProvider } from './contexts/NotifyContext';
import './index.css';
import './App.css';

// createRoot(...).render(...) draws the app into <div id="root">.
// The `!` after getElementById tells TypeScript "this is never null". The
// function could return null in general, but index.html always has the div.
//
// The wrappers, from the outside in:
//   React.StrictMode  extra checks while developing. It deliberately renders
//                     components twice and runs effects twice to expose
//                     bugs, so a console.log may appear twice in `npm run dev`.
//                     It does nothing in the production build.
//   AuthProvider      a "Context provider": it keeps track of who is signed in
//                     and their roles, and any component inside it can read
//                     that with useAuth() instead of receiving it as props.
//   NotifyProvider    the same idea for pop-up notices and "Are you sure?"
//                     questions, read with useNotify().
//   App               the URL -> page table (App.tsx).
// AuthProvider is the outermost, so everything inside it (NotifyProvider and
// every page) can call useAuth().
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <NotifyProvider>
        <App />
      </NotifyProvider>
    </AuthProvider>
  </React.StrictMode>
);