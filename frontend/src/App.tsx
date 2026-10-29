import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import { FeedbackProvider } from './components/Feedback';
import { AuthProvider, useAuth } from './components/Auth';
import Login from './pages/Login';
import Alerts from './pages/Alerts';
import Competency from './pages/Competency';
import BulkImport from './pages/BulkImport';
import AuditLog from './pages/AuditLog';
import Projects from './pages/Projects';
import Permits from './pages/Permits';
import Movements from './pages/Movements';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Courses from './pages/Courses';
import Branches from './pages/Branches';
import Drivers from './pages/Drivers';
import Equipment from './pages/Equipment';
import Inspections from './pages/Inspections';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';

function Shell() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/cards" element={<Courses />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/equipment" element={<Equipment />} />
          <Route path="/inspections" element={<Inspections />} />
          <Route path="/branches" element={<Branches />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/competency" element={<Competency />} />
          <Route path="/bulk-import" element={<BulkImport />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/permits" element={<Permits />} />
          <Route path="/movements" element={<Movements />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FeedbackProvider>
        <Shell />
      </FeedbackProvider>
    </AuthProvider>
  );
}
