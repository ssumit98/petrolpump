import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import OwnerDashboard from "./pages/admin/Dashboard";
import AdminLayout from "./components/admin/AdminLayout";
import AdminAccounts from "./pages/admin/Accounts";
import AdminReports from "./pages/admin/Reports";
import ManagerOperations from "./pages/manager/Operations";
import ManagerStock from "./pages/manager/Stock";
import ShiftVerification from "./pages/manager/ShiftVerification";
import CreditAccounts from "./pages/manager/accounts/Credit";
import AttendantAccounts from "./pages/manager/accounts/Attendant";
import Sales from "./pages/manager/accounts/Sales";
import Vendors from "./pages/manager/Vendors";
import ManagerLayout from "./components/manager/ManagerLayout";
import StaffEntry from "./pages/staff/Entry";
import CustomerCredits from "./pages/customer/MyCredits";
import { VoiceProvider } from "./contexts/VoiceContext";
import VoiceAssistant from "./components/VoiceAssistant";
import OfflineIndicator from "./components/OfflineIndicator";

function App() {
  return (
    <Router>
      <AuthProvider>
        <VoiceProvider>
          <OfflineIndicator />
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/admin/*"
              element={
                <ProtectedRoute allowedRoles={["Owner"]}>
                  <AdminLayout>
                    <Routes>
                      <Route path="dashboard" element={<OwnerDashboard />} />
                      <Route path="reports" element={<AdminReports />} />
                      <Route path="accounts" element={<AdminAccounts />} />
                      <Route path="*" element={<Navigate to="dashboard" replace />} />
                    </Routes>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/manager/*"
              element={
                <ProtectedRoute allowedRoles={["Manager"]}>
                  <ManagerLayout>
                    <Routes>
                      <Route path="operations" element={<ManagerOperations />} />
                      <Route path="shift-verification" element={<ShiftVerification />} />
                      <Route path="stock" element={<ManagerStock />} />
                      <Route path="vendors" element={<Vendors />} />
                      <Route path="accounts/sales" element={<Sales />} />
                      <Route path="accounts/credit" element={<CreditAccounts />} />
                      <Route path="accounts/attendant" element={<AttendantAccounts />} />
                      <Route path="*" element={<Navigate to="operations" replace />} />
                    </Routes>
                  </ManagerLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff/entry"
              element={
                <ProtectedRoute allowedRoles={["PumpAttendant"]}>
                  <StaffEntry />
                </ProtectedRoute>
              }
            />

            <Route
              path="/portal/my-credits"
              element={
                <ProtectedRoute allowedRoles={["Customer", "CreditCustomer"]}>
                  <CustomerCredits />
                </ProtectedRoute>
              }
            />

            {/* Default redirect based on role is handled in ProtectedRoute if we wrap a root component, 
                but for now let's redirect root to login or a public landing page. 
                Since we want role-based redirects, we can create a component that just redirects. */}
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          <VoiceAssistant />
        </VoiceProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
