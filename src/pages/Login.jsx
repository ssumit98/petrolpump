import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase"; // Ensure path is correct
import { Fuel, Lock, Mail } from "lucide-react";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const { login, currentUser, userRole } = useAuth();
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

            const userCredential = await login(email, password);
            const user = userCredential.user;

            // Manual Check for Disabled Status to show error
            const docRef = doc(db, "users", user?.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && docSnap.data().disabled) {
                throw new Error("Your account has been disabled. Please contact the administrator.");
            }

            // Redirect will be handled by useEffect
        } catch (err) {
            setError(err.message.replace("Firebase: ", "").replace("Error ", ""));
            setLoading(false);
        }
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
                        Welcome Back
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



                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold rounded-lg shadow-lg hover:from-orange-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-orange transform transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Processing..." : "Sign In"}
                        </button>
                    </form>


                </div>
            </div>
        </div>
    );
}
