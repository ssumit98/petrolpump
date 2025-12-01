import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, allowedRoles }) {
    const { currentUser, userRole, loading } = useAuth();

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-dark-bg text-white">Loading...</div>;
    }

    if (!currentUser) {
        return <Navigate to="/login" />;
    }

    if (allowedRoles && !allowedRoles.includes(userRole)) {
        // Redirect based on their actual role if they try to access unauthorized page
        if (userRole === "Owner") return <Navigate to="/admin/dashboard" />;
        if (userRole === "Manager") return <Navigate to="/manager/operations" />;
        if (userRole === "PumpAttendant") return <Navigate to="/staff/entry" />;
        if (userRole === "Customer") return <Navigate to="/portal/my-credits" />;

        return <Navigate to="/login" />; // Fallback
    }

    return children;
}
