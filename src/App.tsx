import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';
import { PinGate } from './components/PinGate';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { About } from './pages/About';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { SettingsHome } from './pages/settings/SettingsHome';
import { PortalManagement } from './pages/settings/PortalManagement';
import { Security } from './pages/settings/Security';
import { AuditLog } from './pages/settings/AuditLog';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AuthGuard />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/about" element={<About />} />
              <Route element={<PinGate />}>
                <Route path="/settings" element={<SettingsLayout />}>
                  <Route index element={<SettingsHome />} />
                  <Route path="portals" element={<PortalManagement />} />
                  <Route path="security" element={<Security />} />
                  <Route path="audit" element={<AuditLog />} />
                </Route>
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
