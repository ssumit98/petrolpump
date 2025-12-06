import { useState, useEffect } from "react";
import { db, firebaseConfig } from "../../firebase";
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updatePassword, signOut } from "firebase/auth";
import { UserPlus, Trash2, Mail, Shield, User, Users, Lock, Save, X, RotateCcw, Ban, CheckCircle } from "lucide-react";



export default function AdminAccounts() {
    const [activeTab, setActiveTab] = useState("Manager"); // Manager, Staff, Customer
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        role: "Manager", // Default
        // Specific fields
        phone: "",
        creditLimit: "",
        vehicleNumber: "", // Simplified for customer creation here
    });

    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [newPass, setNewPass] = useState("");
    const [updatingPass, setUpdatingPass] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, [activeTab]);

    async function fetchUsers() {
        setLoading(true);
        try {
            let roleToFetch = activeTab === "Staff" ? "PumpAttendant" : activeTab;

            // For Customer, we need to handle if they are in 'users' or 'customers' collection
            // But for Admin management, we primarily want 'users' (Auth accounts)
            // If Customers are NOT in users, we can't manage their login here easily.
            // Assumption: We will ensure creation puts them in 'users'. 
            // Existing customers might be missing if only in 'customers' collection.

            const q = query(collection(db, "users"), where("role", "==", roleToFetch));
            const snapshot = await getDocs(q);
            setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
            console.error("Error fetching users:", err);
            setMessage({ type: "error", text: "Failed to fetch users." });
        } finally {
            setLoading(false);
        }
    }

    const handleResetPassword = async (email) => {
        if (!window.confirm(`Send password reset email to ${email}?`)) return;
        try {
            // We use the main auth instance here
            const auth = getAuth();
            await sendPasswordResetEmail(auth, email);
            setMessage({ type: "success", text: `Reset email sent to ${email}` });
            setTimeout(() => setMessage({ type: "", text: "" }), 3000);
        } catch (err) {
            console.error("Error sending reset email:", err);
            setMessage({ type: "error", text: "Failed to send reset email." });
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setCreating(true);
        setMessage({ type: "", text: "" });

        let secondaryApp = null;
        try {
            secondaryApp = initializeApp(firebaseConfig, "SecondaryAdminApp");
            const secondaryAuth = getAuth(secondaryApp);

            // 1. Create in Auth
            const userCredential = await createUserWithEmailAndPassword(
                secondaryAuth,
                formData.email,
                formData.password
            );
            const user = userCredential.user;

            // 2. Create in 'users' collection (Critical for login)
            const role = activeTab === "Staff" ? "PumpAttendant" : activeTab;

            const userData = {
                email: formData.email,
                role: role,
                name: formData.name,
                password: formData.password, // Storing effectively for Admin management
                createdAt: serverTimestamp()
            };

            await setDoc(doc(db, "users", user.uid), userData);

            // 3. Role Specific Data
            if (activeTab === "Customer") {
                // Also create in 'customers' collection for CreditManager compatibility
                await setDoc(doc(db, "customers", user.uid), {
                    name: formData.name,
                    email: formData.email,
                    phone: formData.phone || "",
                    creditLimit: parseFloat(formData.creditLimit) || 0,
                    outstandingBalance: 0,
                    vehicles: formData.vehicleNumber ? [formData.vehicleNumber] : [],
                    password: formData.password, // Backup Store
                    createdAt: serverTimestamp()
                });
            } else if (activeTab === "Staff") {
                // Initialize cashInHand
                await updateDoc(doc(db, "users", user.uid), {
                    cashInHand: 0,
                    autoId: Math.floor(100 + Math.random() * 900).toString() // Generate random 3 digit ID
                });
            }

            setMessage({ type: "success", text: "User created successfully!" });
            setShowAddModal(false);
            setFormData({ name: "", email: "", password: "", role: "Manager", phone: "", creditLimit: "", vehicleNumber: "" });
            fetchUsers();

        } catch (err) {
            console.error("Error creating user:", err);
            setMessage({ type: "error", text: err.message });
        } finally {
            setCreating(false);
            if (secondaryApp) await deleteApp(secondaryApp);
        }
    };

    const openPasswordModal = (user) => {
        setSelectedUser(user);
        setNewPass("");
        setShowPasswordModal(true);
        setMessage({ type: "", text: "" });
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setUpdatingPass(true);
        setMessage({ type: "", text: "" });

        if (!selectedUser.password) {
            setMessage({ type: "error", text: "Cannot change password: Old password not found in database. Use email reset." });
            setUpdatingPass(false);
            return;
        }

        let secondaryApp = null;
        try {
            secondaryApp = initializeApp(firebaseConfig, "SecondaryPassChangeApp");
            const secondaryAuth = getAuth(secondaryApp);

            // 1. Sign In as User (Requires old password)
            const userCredential = await signInWithEmailAndPassword(secondaryAuth, selectedUser.email, selectedUser.password);
            const user = userCredential.user;

            // 2. Update Password
            await updatePassword(user, newPass);

            // 3. Update Stored Password
            await updateDoc(doc(db, "users", selectedUser.id), {
                password: newPass
            });
            // If customer, update in customers collection too
            if (activeTab === "Customer") {
                // Check if doc exists first or just try update
                // Assuming ID is same
                const custRef = doc(db, "customers", selectedUser.id);
                // We use set with merge just in case
                await setDoc(custRef, { password: newPass }, { merge: true });
            }

            // 4. Update Local State
            setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, password: newPass } : u));
            setMessage({ type: "success", text: "Password updated successfully!" });
            setShowPasswordModal(false);

            await signOut(secondaryAuth);

        } catch (err) {
            console.error("Error updating password:", err);
            setMessage({ type: "error", text: "Failed: " + err.message });
        } finally {
            setUpdatingPass(false);
            if (secondaryApp) await deleteApp(secondaryApp);
        }
    };

    const handleToggleStatus = async (user) => {
        const newStatus = !user.disabled;
        const action = newStatus ? "Disable" : "Enable";
        if (!window.confirm(`Are you sure you want to ${action} ${user.name}? They will ${newStatus ? "not be able to login" : "regain access"}.`)) return;

        try {
            await updateDoc(doc(db, "users", user.id), {
                disabled: newStatus
            });

            // Update local state
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, disabled: newStatus } : u));
            setMessage({ type: "success", text: `User ${action}d successfully.` });
            setTimeout(() => setMessage({ type: "", text: "" }), 3000);
        } catch (err) {
            console.error("Error updating status:", err);
            setMessage({ type: "error", text: "Failed to update status." });
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Users className="text-primary-orange" /> User Management
                </h1>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-orange-600 transition-colors shadow-lg"
                >
                    <UserPlus size={20} /> Add {activeTab}
                </button>
            </div>

            {message.text && (
                <div className={`px-4 py-3 rounded-lg border ${message.type === 'error' ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-green-500/10 border-green-500 text-green-500'}`}>
                    {message.text}
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-4 border-b border-gray-800 pb-1">
                {["Manager", "Staff", "Customer"].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-sm font-medium transition-colors relative ${activeTab === tab
                            ? "text-primary-orange"
                            : "text-gray-400 hover:text-white"
                            }`}
                    >
                        {tab}
                        {activeTab === tab && (
                            <div className="absolute bottom-[-5px] left-0 w-full h-0.5 bg-primary-orange" />
                        )}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-gray-400">
                        <thead className="bg-gray-900/50 uppercase text-xs font-medium">
                            <tr>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-6 py-4">Email</th>
                                <th className="px-6 py-4">Role</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {users.length === 0 && !loading ? (
                                <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-500">No users found.</td></tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-800/30 transition-colors">
                                        <td className={`px-6 py-4 font-medium transition-colors ${user.disabled ? "text-red-500 line-through" : "text-white"}`}>{user.name || "N/A"}</td>
                                        <td className="px-6 py-4">{user.email}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs border ${user.disabled ? 'bg-red-900/30 border-red-500 text-red-500' : 'bg-gray-800 border-gray-700'}`}>
                                                {user.disabled ? "Disabled" : user.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => openPasswordModal(user)}
                                                className="text-primary-orange hover:text-orange-400 text-sm flex items-center px-3 py-1 bg-orange-500/10 rounded-lg ml-auto border border-orange-500/20"
                                            >
                                                <Lock size={14} className="mr-1" /> Change Pwd
                                            </button>
                                            <button
                                                onClick={() => handleToggleStatus(user)}
                                                className={`ml-2 text-sm flex items-center px-3 py-1 rounded-lg border transition-colors ${user.disabled
                                                    ? "text-green-400 bg-green-500/10 border-green-500/20 hover:bg-green-500/20"
                                                    : "text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20"
                                                    }`}
                                                title={user.disabled ? "Enable Account" : "Disable Account"}
                                            >
                                                {user.disabled ? <CheckCircle size={14} className="mr-1" /> : <Ban size={14} className="mr-1" />}
                                                {user.disabled ? "Enable" : "Disable"}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-md rounded-xl border border-gray-800 shadow-2xl animate-scale-in">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Add New {activeTab}</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Email</label>
                                <input
                                    type="email"
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Password</label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>

                            {activeTab === "Customer" && (
                                <>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Phone</label>
                                        <input
                                            type="tel"
                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                            value={formData.phone}
                                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Credit Limit (₹)</label>
                                        <input
                                            type="number"
                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                            value={formData.creditLimit}
                                            onChange={e => setFormData({ ...formData, creditLimit: e.target.value })}
                                        />
                                    </div>
                                </>
                            )}

                            <button
                                type="submit"
                                disabled={creating}
                                className="w-full py-3 bg-primary-orange text-white font-bold rounded-lg hover:bg-orange-600 shadow-lg flex items-center justify-center gap-2 mt-4"
                            >
                                {creating ? "Creating..." : "Create Account"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Password Change Modal */}
            {showPasswordModal && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-sm rounded-xl border border-gray-800 shadow-2xl animate-scale-in">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Change Password</h3>
                            <button onClick={() => setShowPasswordModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleChangePassword} className="p-6 space-y-4">
                            <p className="text-sm text-gray-400">
                                Setting new password for <span className="text-white font-bold">{selectedUser.name}</span>
                            </p>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">New Password</label>
                                <input
                                    type="text"
                                    required
                                    minLength={6}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={newPass}
                                    onChange={e => setNewPass(e.target.value)}
                                    placeholder="Type new password"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={updatingPass}
                                className="w-full py-3 bg-primary-orange text-white font-bold rounded-lg hover:bg-orange-600 shadow-lg flex items-center justify-center gap-2"
                            >
                                {updatingPass ? "Updating..." : "Set Password"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
