import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs, doc, updateDoc, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { CheckSquare, User, Clock, Wallet, AlertCircle, CheckCircle, Fuel } from "lucide-react";

export default function ShiftVerification() {
    const [attendants, setAttendants] = useState([]);
    const [activeShifts, setActiveShifts] = useState([]);
    const [pendingShifts, setPendingShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(null); // ID of shift being verified
    const [success, setSuccess] = useState("");

    // 1. Fetch Attendants & Listen for Real-time Updates
    useEffect(() => {
        const q = query(collection(db, "users"), where("role", "==", "PumpAttendant"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAttendants(users);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // 2. Listen for Active Shifts
    useEffect(() => {
        const q = query(collection(db, "shift_logs"), where("status", "==", "Active"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const shifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setActiveShifts(shifts);
        });
        return () => unsubscribe();
    }, []);

    // 3. Listen for Pending Verification Shifts
    useEffect(() => {
        const q = query(collection(db, "shift_logs"), where("status", "==", "PendingVerification"), orderBy("endTime", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const shifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPendingShifts(shifts);
        });
        return () => unsubscribe();
    }, []);

    const handleVerifyShift = async (shiftId) => {
        setVerifying(shiftId);
        try {
            const shiftRef = doc(db, "shift_logs", shiftId);
            await updateDoc(shiftRef, {
                status: "Completed",
                verifiedAt: new Date()
            });
            setSuccess("Shift verified successfully!");
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Error verifying shift:", err);
        } finally {
            setVerifying(null);
        }
    };

    if (loading) return <div className="text-white p-4">Loading staff data...</div>;

    return (
        <div className="space-y-8 animate-fade-in">
            <h1 className="text-2xl font-bold text-primary-orange flex items-center gap-2">
                <CheckSquare size={24} /> Shift Verification & Staff Monitor
            </h1>

            {success && (
                <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                    <CheckCircle size={16} /> {success}
                </div>
            )}

            {/* Staff Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {attendants.map(attendant => {
                    const activeShift = activeShifts.find(s => s.attendantId === attendant.id);
                    return (
                        <div key={attendant.id} className={`bg-card-bg rounded-xl border ${activeShift ? 'border-green-500/50' : 'border-gray-800'} p-6 relative overflow-hidden`}>
                            {activeShift && (
                                <div className="absolute top-0 right-0 bg-green-500/20 text-green-400 text-xs font-bold px-3 py-1 rounded-bl-lg">
                                    ACTIVE
                                </div>
                            )}
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-gray-400">
                                    <User size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">{attendant.email?.split('@')[0]}</h3>
                                    <p className="text-xs text-gray-500">{attendant.email}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400 flex items-center gap-2"><Wallet size={14} /> Cash in Hand</span>
                                    <span className="font-mono font-bold text-green-400">₹{attendant.cashInHand || 0}</span>
                                </div>
                                {activeShift ? (
                                    <>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-400 flex items-center gap-2"><Fuel size={14} /> Nozzle</span>
                                            <span className="text-white">{activeShift.nozzleName}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-400 flex items-center gap-2"><Clock size={14} /> Started</span>
                                            <span className="text-white">
                                                {activeShift.startTime?.toDate ? activeShift.startTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-xs text-gray-500 italic py-2">No active job currently.</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Pending Verification Section */}
            <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <AlertCircle size={20} className="text-yellow-500" /> Pending Verification
                        <span className="bg-gray-800 text-white text-xs px-2 py-1 rounded-full">{pendingShifts.length}</span>
                    </h2>
                </div>

                {pendingShifts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <CheckCircle size={48} className="mx-auto mb-4 opacity-20" />
                        <p>All shifts verified! No pending items.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-900/50 text-gray-400 text-xs uppercase tracking-wider">
                                    <th className="p-4">Attendant</th>
                                    <th className="p-4">Nozzle</th>
                                    <th className="p-4 text-right">Sales (L)</th>
                                    <th className="p-4 text-right">Cash Handled</th>
                                    <th className="p-4 text-right">Cash Returned</th>
                                    <th className="p-4 text-right">Short/Excess</th>
                                    <th className="p-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {pendingShifts.map(shift => {
                                    // Calculate simple cash reconciliation logic
                                    // Expected Cash = (Sales * Rate) - but we don't have rate in shift_logs easily yet.
                                    // For now, just show the raw numbers entered.
                                    // Or we can show Cash Remaining vs Cash In Hand logic.

                                    return (
                                        <tr key={shift.id} className="hover:bg-gray-800/30 transition-colors">
                                            <td className="p-4">
                                                <div className="font-bold text-white">{shift.attendantName?.split('@')[0]}</div>
                                                <div className="text-xs text-gray-500">
                                                    {shift.endTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </td>
                                            <td className="p-4 text-gray-300">{shift.nozzleName}</td>
                                            <td className="p-4 text-right font-mono text-white">{shift.totalLitres?.toFixed(2)}</td>
                                            <td className="p-4 text-right font-mono text-white">₹{shift.cashToHandle}</td>
                                            <td className="p-4 text-right font-mono text-green-400">₹{shift.cashReturned}</td>
                                            <td className="p-4 text-right font-mono text-white">
                                                {/* Display Cash Remaining as Short/Excess */}
                                                <span className={shift.cashRemaining < 0 ? "text-red-500" : "text-green-500"}>
                                                    {shift.cashRemaining !== undefined ? `₹${shift.cashRemaining}` : '-'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => handleVerifyShift(shift.id)}
                                                    disabled={verifying === shift.id}
                                                    className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:opacity-50"
                                                >
                                                    {verifying === shift.id ? "..." : "Verify"}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
