import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs, getDoc, doc, updateDoc, query, where, onSnapshot, orderBy, runTransaction, serverTimestamp, addDoc } from "firebase/firestore";
import { CheckSquare, User, Clock, Wallet, AlertCircle, CheckCircle, Fuel, X, Edit, Play, Square } from "lucide-react";

export default function ShiftVerification() {
    const [attendants, setAttendants] = useState([]);
    const [activeShifts, setActiveShifts] = useState([]);
    const [startRequests, setStartRequests] = useState([]);
    const [endRequests, setEndRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState("");
    const [error, setError] = useState("");
    const [prices, setPrices] = useState({ petrol: 0, diesel: 0 }); // Fetch prices for calculations

    // Modals
    const [showStartModal, setShowStartModal] = useState(false);
    const [showEndModal, setShowEndModal] = useState(false);
    const [selectedShift, setSelectedShift] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [processing, setProcessing] = useState(false);
    const [showManagerEndModal, setShowManagerEndModal] = useState(false); // New Modal for Manager

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

    // 3. Listen for Pending Start Requests (Now Active but Unverified)
    useEffect(() => {
        const q = query(
            collection(db, "shift_logs"),
            where("status", "==", "Active"),
            where("startVerified", "==", false),
            orderBy("startTime", "desc")
        );
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

    // 5. Fetch Prices
    useEffect(() => {
        const fetchPrices = async () => {
            try {
                const petrolDoc = await getDoc(doc(db, "prices", "petrol"));
                const dieselDoc = await getDoc(doc(db, "prices", "diesel"));

                setPrices({
                    petrol: petrolDoc.exists() ? petrolDoc.data().rate : 0,
                    diesel: dieselDoc.exists() ? dieselDoc.data().rate : 0
                });
            } catch (err) {
                console.error("Error fetching prices:", err);
            }
        };
        fetchPrices();
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

    // Open End Modal (Verification)
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

    // Open Manager End Modal (Direct Action)
    const openManagerEndModal = (shift) => {
        setSelectedShift(shift);
        setEditForm({
            endReading: shift.startReading, // Default start at current reading
            testingLitres: 0,
            cashReturned: 0,
            cashOnline: 0,
            change: 0
        });
        setShowManagerEndModal(true);
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
                    // status: "Active", // Already Active
                    startVerified: true,
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

            // Fetch Tank ID First (for stock adjustment)
            const tanksQuery = query(collection(db, "tanks"), where("fuelType", "==", selectedShift.fuelType));
            const tanksSnapshot = await getDocs(tanksQuery);
            const tankId = tanksSnapshot.empty ? null : tanksSnapshot.docs[0].id; // Assign first tank found

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

                let tankRef = null;
                let tankDoc = null;
                if (tankId) {
                    tankRef = doc(db, "tanks", tankId);
                    tankDoc = await transaction.get(tankRef);
                }

                if (!userDoc.exists()) throw new Error("User not found");

                // 0. Fetch Tank for Stock Adjustment (if litres changed)
                const oldTotalLitres = selectedShift.totalLitres || (selectedShift.endReading - selectedShift.startReading);
                const litreDiff = totalLitres - oldTotalLitres;



                if (Math.abs(litreDiff) > 0.01) {
                    // Need to find tank. We do this by query inside transaction? No, queries not supported in runTransaction easily for "find".
                    // Best to fetch tank OUTSIDE transaction if possible, or assume 1 tank per fuel type.
                    // We will do a query before transaction to get Tank ID.
                }

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

                // 4. Update Tank Stock if needed
                if (tankRef && tankDoc && Math.abs(totalLitres - (selectedShift.totalLitres || 0)) > 0.001) {
                    const oldLitres = selectedShift.totalLitres || 0;
                    const diff = totalLitres - oldLitres; // Positive means we sold MORE, so Need to DEDUCT MORE.
                    const currentStock = tankDoc.data().currentLevel || 0;
                    transaction.update(tankRef, {
                        currentLevel: currentStock - diff
                    });
                }

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

    // Handle Manager End Shift (Directly)
    const handleManagerEnd = async (e) => {
        e.preventDefault();
        setProcessing(true);
        setError("");

        try {
            const endReading = parseFloat(editForm.endReading);
            const testingLitres = parseFloat(editForm.testingLitres) || 0;
            const cashReturned = parseFloat(editForm.cashReturned) || 0;
            const cashOnline = parseFloat(editForm.cashOnline) || 0;
            const change = parseFloat(editForm.change) || 0;

            if (endReading < selectedShift.startReading) {
                throw new Error("End reading cannot be less than start reading.");
            }

            // Calculations
            const grossLitres = endReading - selectedShift.startReading;
            const netLitres = Math.max(0, grossLitres - testingLitres);

            // Fetch Price
            const fuelPrice = selectedShift.fuelType === "Petrol" ? prices.petrol : prices.diesel;
            if (!fuelPrice) throw new Error("Fuel price not set. Cannot calculate sales.");

            const totalAmount = netLitres * fuelPrice;

            // Fetch Tank ID
            const tanksQuery = query(collection(db, "tanks"), where("fuelType", "==", selectedShift.fuelType));
            const tanksSnapshot = await getDocs(tanksQuery);
            const tankId = tanksSnapshot.empty ? null : tanksSnapshot.docs[0].id;

            await runTransaction(db, async (transaction) => {
                const shiftRef = doc(db, "shift_logs", selectedShift.id);
                const nozzleRef = doc(db, "nozzles", selectedShift.nozzleId);
                const userRef = doc(db, "users", selectedShift.attendantId);

                let tankRef = null;
                let tankDoc = null;
                if (tankId) {
                    tankRef = doc(db, "tanks", tankId);
                    tankDoc = await transaction.get(tankRef);
                }

                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists()) throw new Error("User not found");

                // 1. Update Shift Log
                transaction.update(shiftRef, {
                    status: "Completed",
                    endTime: serverTimestamp(),
                    endReading: endReading,
                    testingLitres: testingLitres,
                    totalLitres: netLitres,
                    cashReturned: cashReturned,
                    // Cash Remaining calculation:
                    // This is for the RECORD in shift_log, usually represents what user KEPT relative to SALES.
                    // But here Manager is deciding logic. 
                    // Let's stick to standard formula if we want consistency: (Sales - Returned - Change)
                    // Note: This does NOT include their start float. That's separate.
                    cashRemaining: Math.max(0, totalAmount - cashReturned - change - cashOnline), // Approximate
                    cashOnline: cashOnline,
                    change: change,
                    verifiedAt: serverTimestamp(),
                    managerEnded: true // Flag to track manager intervention
                });

                // 2. Update Nozzle
                transaction.update(nozzleRef, {
                    currentMeterReading: endReading
                });

                // 3. Update User Cash
                // Logic: Current + (SalesAmount - Returned - Change - Online)
                // Note: Online is money NOT collected in cash.
                const currentCashInHand = userDoc.data().cashInHand || 0;

                // Effective Cash Collected = Total Sales - Online
                const cashCollected = totalAmount - cashOnline;

                // Net Change to Wallet = CashCollected - (Returned + Change)
                const walletAdjustment = cashCollected - (cashReturned + change);

                transaction.update(userRef, {
                    cashInHand: currentCashInHand + walletAdjustment
                });

                // 4. Update Tank Stock
                if (tankRef && tankDoc) {
                    const currentStock = tankDoc.data().currentLevel || 0;
                    transaction.update(tankRef, {
                        currentLevel: currentStock - netLitres
                    });
                }

                // 5. Add to Daily Sales
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
                    totalLitres: netLitres,
                    amount: totalAmount, // Add amount for reference
                    timestamp: serverTimestamp(),
                });
            });

            setSuccess("Shift ENDED by Manager successfully!");
            setShowManagerEndModal(false);
        } catch (err) {
            console.error("Error ending shift:", err);
            setError(err.message || "Failed to end shift.");
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
                                <div className="absolute top-2 right-2 flex gap-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mt-2"></div>
                                </div>
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
                                <div className="space-y-3">
                                    <div className="text-xs text-gray-400">
                                        On {activeShift.nozzleName} <br />
                                        Since {activeShift.startTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <button
                                        onClick={() => openManagerEndModal(activeShift)}
                                        className="w-full py-2 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white border border-red-600/50 rounded-lg text-xs font-bold transition-colors"
                                    >
                                        End Job
                                    </button>
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
            {/* Manager End Modal */}
            {showManagerEndModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-card-bg rounded-xl w-full max-w-md border border-gray-800 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-red-900/10">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <AlertCircle size={20} className="text-red-500" /> End Job (Manager Override)
                            </h3>
                            <button onClick={() => setShowManagerEndModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleManagerEnd} className="p-4 space-y-4">
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400 mb-4">
                                Warning: You are manually ending an active shift. Ensure all values are accurate as this will directly update stocks and user wallets.
                            </div>

                            <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                <span className="text-xs text-gray-500 block">Start Reading</span>
                                <span className="text-lg font-mono font-bold text-gray-300">{selectedShift.startReading}</span>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">End Reading</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    min={selectedShift.startReading}
                                    value={editForm.endReading}
                                    onChange={e => setEditForm({ ...editForm, endReading: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange font-mono text-lg"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Testing (Litres)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editForm.testingLitres}
                                    onChange={e => setEditForm({ ...editForm, testingLitres: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    placeholder="0.00"
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
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Cash Online</label>
                                    <input
                                        type="number"
                                        required
                                        value={editForm.cashOnline}
                                        onChange={e => setEditForm({ ...editForm, cashOnline: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Expenses / Change</label>
                                <div className="relative">
                                    <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                    <input
                                        type="number"
                                        required
                                        value={editForm.change}
                                        onChange={e => setEditForm({ ...editForm, change: e.target.value })}
                                        className="w-full pl-10 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    />
                                </div>
                            </div>

                            <button disabled={processing} className="w-full py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-lg mt-4">
                                {processing ? "Processing..." : "End Shift & Update Data"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
