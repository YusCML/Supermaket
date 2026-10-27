import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RolePickerPage from './pages/RolePickerPage';
import SelfServePage from './pages/SelfServePage';
import CashierPage from './pages/CashierPage';
import AdminPage from './pages/AdminPage';
import ProtectedRoute from './components/ProtectedRoute';

// After logging in everyone lands on /app, which asks which role to continue
// as. Each role has its own page, and ProtectedRoute's `role` sends anyone
// whose role doesn't include that page back to /app.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <RolePickerPage />
            </ProtectedRoute>
          }
        />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}