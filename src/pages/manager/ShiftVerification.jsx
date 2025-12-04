import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs, doc, updateDoc, query, where, onSnapshot, orderBy, runTransaction, serverTimestamp, addDoc } from "firebase/firestore";
import { CheckSquare, User, Clock, Wallet, AlertCircle, CheckCircle, Fuel, X, Edit, Play, Square } from "lucide-react";

export default function ShiftVerification() {
    const [attendants, setAttendants] = useState([]);
    const [activeShifts, setActiveShifts] = useState([]);
    const [startRequests, setStartRequests] = useState([]);
    const [endRequests, setEndRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState("");
    const [error, setError] = useState("");

    // Modals
    const [showStartModal, setShowStartModal] = useState(false);
    const [showEndModal, setShowEndModal] = useState(false);
    const [selectedShift, setSelectedShift] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [processing, setProcessing] = useState(false);

    // 1. Fetch Attendants
    useEffect(() => {
        const q = query(collection(db, "users"), where("role", "==", "PumpAttendant"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setAttendants(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // 2. Listen for Active Shifts
    useEffect(() => {
        const q = query(collection(db, "shift_logs"), where("status", "==", "Active"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setActiveShifts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    // 3. Listen for Pending Start Requests
    useEffect(() => {
        const q = query(collection(db, "shift_logs"), where("status", "==", "PendingStartVerification"), orderBy("startTime", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setStartRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    // 4. Listen for Pending End Requests
    useEffect(() => {
        const q = query(collection(db, "shift_logs"), where("status", "==", "PendingEndVerification"), orderBy("endTime", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setEndRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    // Open Start Modal
    const openStartModal = (shift) => {
        setSelectedShift(shift);
        setEditForm({
            startReading: shift.startReading,
            cashToHandle: shift.cashToHandle
        });
        setShowStartModal(true);
    };

    // Open End Modal
    const openEndModal = (shift) => {
        setSelectedShift(shift);
        setEditForm({
            endReading: shift.endReading,
            cashReturned: shift.cashReturned,
            cashOnline: shift.cashOnline,
            change: shift.change
        });
        setShowEndModal(true);
    };

    // Handle Approve Start
    const handleApproveStart = async (e) => {
        e.preventDefault();
        setProcessing(true);
        setError("");

        try {
            const cashToHandle = parseFloat(editForm.cashToHandle) || 0;
            const startReading = parseFloat(editForm.startReading);

            await runTransaction(db, async (transaction) => {
                const shiftRef = doc(db, "shift_logs", selectedShift.id);
                const userRef = doc(db, "users", selectedShift.attendantId);
                const userDoc = await transaction.get(userRef);

                if (!userDoc.exists()) throw new Error("User not found");

                // Re-calculate user cash:
                // We need to adjust the cash added.
                // Original logic added 'cashToHandle' to user balance when creating the log.
                // If manager changes it, we need to adjust the difference.
                const originalCashAdded = selectedShift.cashToHandle || 0;
                const diff = cashToHandle - originalCashAdded;
                const newCashInHand = (userDoc.data().cashInHand || 0) + diff;

                transaction.update(shiftRef, {
                    status: "Active",
                    startReading: startReading,
                    cashToHandle: cashToHandle,
                    verifiedAt: serverTimestamp()
                });

                transaction.update(userRef, {
                    cashInHand: newCashInHand
                });
            });

            setSuccess("Shift START approved successfully!");
            setShowStartModal(false);
        } catch (err) {
            console.error("Error approving start:", err);
            setError("Failed to approve start.");
        } finally {
            setProcessing(false);
        }
    };

    // Handle Approve End
    const handleApproveEnd = async (e) => {
        e.preventDefault();
        setProcessing(true);
        setError("");

        try {
            const endReading = parseFloat(editForm.endReading);
            const cashReturned = parseFloat(editForm.cashReturned) || 0;
            const cashOnline = parseFloat(editForm.cashOnline) || 0;
            const change = parseFloat(editForm.change) || 0;

            // Original values from the shift log (Staff's claim)
            const originalReturned = selectedShift.cashReturned || 0;
            const originalOnline = selectedShift.cashOnline || 0;
            const originalChange = selectedShift.change || 0;
            const originalRemaining = selectedShift.cashRemaining || 0;

            // Calculate Adjustments (Positive diff means money goes BACK to the wallet)
            // 1. Returned: If I returned LESS than claimed, I kept MORE.
            const diffReturned = originalReturned - cashReturned;

            // 2. Change: If I spent LESS than claimed, I kept MORE.
            const diffChange = originalChange - change;

            // 3. Online: If Online is LESS than claimed, it means it was Cash, so I have MORE.
            const diffOnline = originalOnline - cashOnline;

            const totalAdjustment = diffReturned + diffChange + diffOnline;
            const newCashRemaining = originalRemaining + totalAdjustment;

            // Recalculate derived values
            const totalLitres = endReading - selectedShift.startReading;

            await runTransaction(db, async (transaction) => {
                const shiftRef = doc(db, "shift_logs", selectedShift.id);
                const nozzleRef = doc(db, "nozzles", selectedShift.nozzleId);
                const userRef = doc(db, "users", selectedShift.attendantId);
                const userDoc = await transaction.get(userRef);

                if (!userDoc.exists()) throw new Error("User not found");

                // 1. Update Shift
                transaction.update(shiftRef, {
                    status: "Completed",
                    endReading: endReading,
                    totalLitres: totalLitres,
                    cashReturned: cashReturned,
                    cashRemaining: newCashRemaining,
                    cashOnline: cashOnline,
                    change: change,
                    verifiedAt: serverTimestamp()
                });

                // 2. Update Nozzle
                transaction.update(nozzleRef, {
                    currentMeterReading: endReading
                });

                // 3. Update User Cash
                // We apply the adjustment to their CURRENT cash in hand
                const currentCashInHand = userDoc.data().cashInHand || 0;
                transaction.update(userRef, {
                    cashInHand: currentCashInHand + totalAdjustment
                });

                // 4. Add to Daily Sales
                const salesRef = doc(collection(db, "daily_sales"));
                transaction.set(salesRef, {
                    date: new Date().toISOString().split('T')[0],
                    attendantId: selectedShift.attendantId,
                    attendantEmail: selectedShift.attendantName,
                    nozzleId: selectedShift.nozzleId,
                    nozzleName: selectedShift.nozzleName,
                    fuelType: selectedShift.fuelType || "Unknown",
                    startReading: selectedShift.startReading,
                    endReading: endReading,
                    totalLitres: totalLitres,
                    timestamp: serverTimestamp(),
                });
            });

            setSuccess("Shift END approved successfully!");
            setShowEndModal(false);
        } catch (err) {
            console.error("Error approving end:", err);
            setError("Failed to approve end.");
        } finally {
            setProcessing(false);
        }
    };


    if (loading) return <div className="text-white p-4">Loading data...</div>;

    return (
        <div className="space-y-8 animate-fade-in">
            <h1 className="text-2xl font-bold text-primary-orange flex items-center gap-2">
                <CheckSquare size={24} /> Shift Verification
            </h1>

            {success && (
                <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                    <CheckCircle size={16} /> {success}
                </div>
            )}

            {/* 1. Start Requests */}
            <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-yellow-900/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Play size={20} className="text-yellow-500" /> Start Requests
                        <span className="bg-gray-800 text-white text-xs px-2 py-1 rounded-full">{startRequests.length}</span>
                    </h2>
                </div>
                {startRequests.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 text-sm">No pending start requests.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase">
                                <tr>
                                    <th className="p-3">Attendant</th>
                                    <th className="p-3">Nozzle</th>
                                    <th className="p-3 text-right">Start Reading</th>
                                    <th className="p-3 text-right">Cash Taken</th>
                                    <th className="p-3 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 text-sm">
                                {startRequests.map(shift => (
                                    <tr key={shift.id} className="hover:bg-gray-800/30">
                                        <td className="p-3 font-bold text-white">{shift.attendantName?.split('@')[0]}</td>
                                        <td className="p-3 text-gray-300">{shift.nozzleName}</td>
                                        <td className="p-3 text-right font-mono text-white">{shift.startReading}</td>
                                        <td className="p-3 text-right font-mono text-green-400">₹{shift.cashToHandle}</td>
                                        <td className="p-3 text-center">
                                            <button
                                                onClick={() => openStartModal(shift)}
                                                className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-xs font-bold"
                                            >
                                                Verify & Start
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 2. End Requests */}
            <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-blue-900/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Square size={20} className="text-blue-500" /> End Requests
                        <span className="bg-gray-800 text-white text-xs px-2 py-1 rounded-full">{endRequests.length}</span>
                    </h2>
                </div>
                {endRequests.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 text-sm">No pending end requests.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase">
                                <tr>
                                    <th className="p-3">Attendant</th>
                                    <th className="p-3">Nozzle</th>
                                    <th className="p-3 text-right">End Reading</th>
                                    <th className="p-3 text-right">Sales (L)</th>
                                    <th className="p-3 text-right">Cash Returned</th>
                                    <th className="p-3 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 text-sm">
                                {endRequests.map(shift => (
                                    <tr key={shift.id} className="hover:bg-gray-800/30">
                                        <td className="p-3 font-bold text-white">{shift.attendantName?.split('@')[0]}</td>
                                        <td className="p-3 text-gray-300">{shift.nozzleName}</td>
                                        <td className="p-3 text-right font-mono text-white">{shift.endReading}</td>
                                        <td className="p-3 text-right font-mono text-white">{(shift.endReading - shift.startReading).toFixed(2)}</td>
                                        <td className="p-3 text-right font-mono text-green-400">₹{shift.cashReturned}</td>
                                        <td className="p-3 text-center">
                                            <button
                                                onClick={() => openEndModal(shift)}
                                                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-bold"
                                            >
                                                Verify & End
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 3. Active Staff Monitor */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                {attendants.map(attendant => {
                    const activeShift = activeShifts.find(s => s.attendantId === attendant.id);
                    return (
                        <div key={attendant.id} className={`bg-card-bg rounded-xl border ${activeShift ? 'border-green-500/50' : 'border-gray-800'} p-4 relative`}>
                            {activeShift && (
                                <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            )}
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-gray-400">
                                    <User size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-sm">{attendant.email?.split('@')[0]}</h3>
                                    <p className="text-xs text-green-400 font-mono">₹{attendant.cashInHand || 0}</p>
                                </div>
                            </div>
                            {activeShift ? (
                                <div className="text-xs text-gray-400">
                                    On {activeShift.nozzleName} <br />
                                    Since {activeShift.startTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            ) : (
                                <div className="text-xs text-gray-600 italic">Idle</div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Start Modal */}
            {showStartModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-card-bg rounded-xl w-full max-w-md border border-gray-800 shadow-2xl">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Verify Start Job</h3>
                            <button onClick={() => setShowStartModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleApproveStart} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Start Reading</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={editForm.startReading}
                                    onChange={e => setEditForm({ ...editForm, startReading: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Cash to Handle (₹)</label>
                                <input
                                    type="number"
                                    required
                                    value={editForm.cashToHandle}
                                    onChange={e => setEditForm({ ...editForm, cashToHandle: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                />
                            </div>
                            <button disabled={processing} className="w-full py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700">
                                {processing ? "Approving..." : "Approve & Start"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* End Modal */}
            {showEndModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-card-bg rounded-xl w-full max-w-md border border-gray-800 shadow-2xl">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Verify End Job</h3>
                            <button onClick={() => setShowEndModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleApproveEnd} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">End Reading</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={editForm.endReading}
                                    onChange={e => setEditForm({ ...editForm, endReading: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Cash Returned</label>
                                    <input
                                        type="number"
                                        required
                                        value={editForm.cashReturned}
                                        onChange={e => setEditForm({ ...editForm, cashReturned: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Cash Online</label>
                                    <input
                                        type="number"
                                        required
                                        value={editForm.cashOnline}
                                        onChange={e => setEditForm({ ...editForm, cashOnline: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Change / Expenses</label>
                                <input
                                    type="number"
                                    required
                                    value={editForm.change}
                                    onChange={e => setEditForm({ ...editForm, change: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                />
                            </div>
                            <button disabled={processing} className="w-full py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">
                                {processing ? "Approving..." : "Approve & Complete"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
