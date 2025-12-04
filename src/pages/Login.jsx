import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Fuel, Lock, Mail, UserCircle } from "lucide-react";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [isSignup, setIsSignup] = useState(false); // Toggle for testing
    const [selectedRole, setSelectedRole] = useState("Owner"); // Default for testing

    const { login, signup, currentUser, userRole } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (currentUser && userRole) {
            if (userRole === "Owner") navigate("/admin/dashboard");
            else if (userRole === "Manager") navigate("/manager/operations");
            else if (userRole === "PumpAttendant") navigate("/staff/entry");
            else if (userRole === "Customer" || userRole === "CreditCustomer") navigate("/portal/my-credits");
        }
    }, [currentUser, userRole, navigate]);

    async function handleSubmit(e) {
        e.preventDefault();

        try {
            setError("");
            setLoading(true);
            if (isSignup) {
                await signup(email, password, selectedRole);
                // Redirect will be handled by useEffect once userRole is set in context
            } else {
                await login(email, password);
                // Redirect will be handled by useEffect once userRole is fetched
            }
        } catch (err) {
            setError("Failed to " + (isSignup ? "create account" : "log in") + ": " + err.message);
            setLoading(false);
        }
        // Note: We don't set loading(false) on success because we want to show "Processing..." 
        // until the redirect happens. If we set it to false, the form reappears briefly.
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4">
            <div className="max-w-md w-full bg-card-bg rounded-2xl shadow-2xl overflow-hidden border border-gray-800">
                <div className="p-8">
                    <div className="flex justify-center mb-6">
                        <div className="p-3 bg-primary-orange/20 rounded-full">
                            <Fuel className="w-10 h-10 text-primary-orange" />
                        </div>
                    </div>

                    <h2 className="text-3xl font-bold text-center text-white mb-2">
                        {isSignup ? "Create Test User" : "Welcome Back"}
                    </h2>
                    <p className="text-center text-gray-400 mb-8">
                        Petrol Pump Management System
                    </p>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg mb-6 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                                <input
                                    type="email"
                                    required
                                    className="w-full pl-10 pr-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange focus:border-transparent text-white placeholder-gray-600 transition-all"
                                    placeholder="name@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                                <input
                                    type="password"
                                    required
                                    className="w-full pl-10 pr-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange focus:border-transparent text-white placeholder-gray-600 transition-all"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        {isSignup && (
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Select Role (Test Mode)</label>
                                <div className="relative">
                                    <UserCircle className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                                    <select
                                        className="w-full pl-10 pr-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange focus:border-transparent text-white transition-all appearance-none"
                                        value={selectedRole}
                                        onChange={(e) => setSelectedRole(e.target.value)}
                                    >
                                        <option value="Owner">Owner (Super Admin)</option>
                                        <option value="Manager">Manager (Operational Admin)</option>
                                        <option value="PumpAttendant">Pump Boy (Attendant)</option>
                                        <option value="Customer">Customer (Credit User)</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold rounded-lg shadow-lg hover:from-orange-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-orange transform transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Processing..." : (isSignup ? "Create User" : "Sign In")}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button
                            onClick={() => setIsSignup(!isSignup)}
                            className="text-sm text-gray-400 hover:text-primary-orange transition-colors"
                        >
                            {isSignup ? "Already have an account? Sign In" : "Need to create a test user? Switch to Signup"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
