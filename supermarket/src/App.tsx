// App.tsx: the "which URL shows which page" table. main.tsx draws it.
//
// It uses React Router, which swaps pages when the address in the browser bar
// changes, without reloading the whole site:
//   <BrowserRouter>  watches the address bar. Used once, around everything.
//   <Routes>         looks at the current address and shows the ONE <Route>
//                    whose `path` matches it.
//   <Route>          one row of the table: `path` is the address and
//                    `element` is what to show there.
//   <Navigate>       a component that, as soon as it's shown, sends the
//                    browser to another address. `replace` swaps out the
//                    current history entry, so the Back button doesn't land
//                    on the address we just left and bounce again.
//
// Pages that need a signed-in person are wrapped in <ProtectedRoute> (see
// components/ProtectedRoute.tsx).
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import RolePickerPage from './pages/RolePickerPage';
import SelfServePage from './pages/SelfServePage';
import CashierPage from './pages/CashierPage';
import AdminPage from './pages/AdminPage';
import ProtectedRoute from './components/ProtectedRoute';

// After logging in everyone lands on /app, which asks which role to continue
// as. Each role has its own page, and ProtectedRoute's `role` sends anyone
// whose role doesn't include that page back to /app.
// Signed-out visitors who open any protected page are sent to /login instead.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public: anyone can open these, signed in or not. */}
        <Route path="/" element={<LandingPage />} />
        {/* Same landing page, with the sign-in pop-up open on top. */}
        <Route path="/login" element={<LandingPage />} />
        {/* The "How would you like to continue?" screen. No `role` on
            ProtectedRoute: any signed-in person may open it. */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <RolePickerPage />
            </ProtectedRoute>
          }
        />
        {/* One page per role. Only people who hold that role get in. */}
        <Route
          path="/self-serve"
          element={
            <ProtectedRoute role="customer">
              <SelfServePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cashier"
          element={
            <ProtectedRoute role="cashier">
              <CashierPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <AdminPage />
            </ProtectedRoute>
          }
        />
        {/* "*" matches any address not listed above (a typo, an old link),
            and sends it to the home page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}