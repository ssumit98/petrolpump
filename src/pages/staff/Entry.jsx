import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../firebase";
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where, orderBy, limit, runTransaction, onSnapshot } from "firebase/firestore";
import { LogOut, Fuel, Save, Calculator, AlertCircle, Mic, Play, Square, Clock, Wallet, X, ArrowRightLeft, Check, User, Calendar as CalendarIcon } from "lucide-react";
import { useVoice } from "../../contexts/VoiceContext";
import Calendar from "../../components/common/Calendar";

export default function StaffEntry() {
    const { logout, currentUser } = useAuth();
    const { lastCommand } = useVoice();
    const [nozzles, setNozzles] = useState([]);
    const [activeShift, setActiveShift] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // New State for Phase 19
    const [userCashInHand, setUserCashInHand] = useState(0);
    const [otherAttendants, setOtherAttendants] = useState([]);
    const [pendingTransfers, setPendingTransfers] = useState([]);

    // Modals
    const [showStartModal, setShowStartModal] = useState(false);
    const [showEndModal, setShowEndModal] = useState(false);
    const [showLendModal, setShowLendModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // History State
    const [shiftHistory, setShiftHistory] = useState([]); // Array of Date objects
    const [selectedDateShifts, setSelectedDateShifts] = useState([]);
    const [selectedDate, setSelectedDate] = useState(null);

    // Forms
    const [startForm, setStartForm] = useState({
        nozzleId: "",
        cashToHandle: "",
        previousCashInHand: "" // Will be autofilled
    });

    const [endForm, setEndForm] = useState({
        endReading: "",
        cashReturned: "",
        cashRemaining: "",
        cashOnline: "",
        change: "",
        testingLitres: "" // Added testingLitres
    });

    const [lendForm, setLendForm] = useState({
        receiverId: "",
        amount: ""
    });

    // Fetch Data & Listeners
    useEffect(() => {
        async function fetchData() {
            try {
                // 1. Fetch Nozzles
                const nozzlesSnapshot = await getDocs(collection(db, "nozzles"));
                let nozzleList = nozzlesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (nozzleList.length === 0) {
                    await seedNozzles();
                    const newSnapshot = await getDocs(collection(db, "nozzles"));
                    nozzleList = newSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                }
                setNozzles(nozzleList);

                // 2. Fetch Other Attendants (for lending)
                const usersQuery = query(collection(db, "users"), where("role", "==", "PumpAttendant"));
                const usersSnapshot = await getDocs(usersQuery);
                const attendants = usersSnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(u => u.id !== currentUser.uid);
                setOtherAttendants(attendants);

            } catch (err) {
                console.error("Error fetching data:", err);
                setError("Failed to load data.");
            } finally {
                setLoading(false);
            }
        }
        fetchData();

        // 3. Real-time Listener for User Data (Cash in Hand)
        const userUnsub = onSnapshot(doc(db, "users", currentUser.uid), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setUserCashInHand(data.cashInHand || 0);
                // Update start form if modal is not open or just opened
                setStartForm(prev => ({ ...prev, previousCashInHand: data.cashInHand || 0 }));
            }
        });

        // 4. Real-time Listener for Active Shift
        const shiftQuery = query(
            collection(db, "shift_logs"),
            where("attendantId", "==", currentUser.uid),
            where("status", "in", ["Active", "PendingStartVerification", "PendingEndVerification"]),
            limit(1)
        );
        const shiftUnsub = onSnapshot(shiftQuery, (snapshot) => {
            if (!snapshot.empty) {
                setActiveShift({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            } else {
                setActiveShift(null);
            }
        });

        // 5. Real-time Listener for Pending Transfers
        const transfersQuery = query(
            collection(db, "cash_transfers"),
            where("receiverId", "==", currentUser.uid),
            where("status", "==", "Pending")
        );
        const transfersUnsub = onSnapshot(transfersQuery, (snapshot) => {
            setPendingTransfers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => {
            userUnsub();
            shiftUnsub();
            transfersUnsub();
        };
    }, [currentUser]);

    // 6. Fetch Shift History (for Calendar)
    useEffect(() => {
        async function fetchHistory() {
            try {
                const historyQuery = query(
                    collection(db, "shift_logs"),
                    where("attendantId", "==", currentUser.uid),
                    where("status", "==", "PendingVerification") // Or "Completed" based on workflow
                );
                const snapshot = await getDocs(historyQuery);
                const dates = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return data.startTime?.toDate ? data.startTime.toDate() : new Date(data.startTime);
                });
                setShiftHistory(dates);
            } catch (err) {
                console.error("Error fetching history:", err);
            }
        }
        fetchHistory();
    }, [currentUser, success]); // Re-fetch on success (e.g. after ending job)

    // Seed mock nozzles
    async function seedNozzles() {
        const mockNozzles = [
            { nozzleName: "Nozzle 1 - Petrol", currentMeterReading: 15000, fuelType: "Petrol" },
            { nozzleName: "Nozzle 2 - Diesel", currentMeterReading: 24000, fuelType: "Diesel" },
        ];
        for (const n of mockNozzles) {
            await addDoc(collection(db, "nozzles"), n);
        }
    }

    // Handle Start Job
    const handleStartJob = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const nozzle = nozzles.find(n => n.id === startForm.nozzleId);
            if (!nozzle) throw new Error("Invalid nozzle selected");

            const cashToHandle = parseFloat(startForm.cashToHandle) || 0;

            await runTransaction(db, async (transaction) => {
                // 1. Get current user data for consistency
                const userRef = doc(db, "users", currentUser.uid);
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists()) throw new Error("User not found");

                const currentDbCash = userDoc.data().cashInHand || 0;
                const newCash = currentDbCash + cashToHandle;

                // 2. Create Shift Log
                const shiftRef = doc(collection(db, "shift_logs"));
                transaction.set(shiftRef, {
                    attendantId: currentUser.uid,
                    attendantName: currentUser.email,
                    nozzleId: startForm.nozzleId,
                    nozzleName: nozzle.nozzleName,
                    fuelType: nozzle.fuelType, // Added fuelType
                    startTime: serverTimestamp(),
                    startReading: nozzle.currentMeterReading,
                    cashToHandle: cashToHandle,
                    previousCashInHand: currentDbCash,
                    previousCashInHand: currentDbCash,
                    status: "PendingStartVerification"
                });

                // 3. Update User Cash in Hand
                transaction.update(userRef, { cashInHand: newCash });
            });

            setSuccess("Job started successfully!");
            setShowStartModal(false);
            setStartForm({ nozzleId: "", cashToHandle: "", previousCashInHand: "" });
        } catch (err) {
            console.error("Error starting job:", err);
            setError("Failed to start job.");
        } finally {
            setSubmitting(false);
        }
    };

    // Handle End Job
    const handleEndJob = async (e) => {
        e.preventDefault();
        if (!activeShift) return;
        setSubmitting(true);
        setError("");

        try {
            const endReading = parseFloat(endForm.endReading);
            if (endReading < activeShift.startReading) {
                throw new Error("End reading cannot be less than start reading.");
            }

            const testingLitres = parseFloat(endForm.testingLitres) || 0;
            const totalLitres = endReading - activeShift.startReading;
            const netLitres = totalLitres - testingLitres; // Calculate net litres
            const cashRemaining = parseFloat(endForm.cashRemaining) || 0;

            await runTransaction(db, async (transaction) => {
                // 1. Update Shift Log
                const shiftRef = doc(db, "shift_logs", activeShift.id);
                transaction.update(shiftRef, {
                    endTime: serverTimestamp(),
                    endReading: endReading,
                    totalLitres: totalLitres,
                    netLitres: netLitres, // Save net litres
                    testingLitres: testingLitres, // Save testing litres
                    cashReturned: parseFloat(endForm.cashReturned) || 0,
                    cashRemaining: cashRemaining,
                    cashOnline: parseFloat(endForm.cashOnline) || 0,
                    change: parseFloat(endForm.change) || 0,
                    status: "PendingEndVerification"
                });

                // 2. Update Nozzle Reading
                const nozzleRef = doc(db, "nozzles", activeShift.nozzleId);
                transaction.update(nozzleRef, {
                    currentMeterReading: endReading
                });

                // 3. Update User Cash in Hand
                const userRef = doc(db, "users", currentUser.uid);
                transaction.update(userRef, {
                    cashInHand: cashRemaining
                });

                // 4. Add to Daily Sales
                const salesRef = doc(collection(db, "daily_sales"));
                transaction.set(salesRef, {
                    date: new Date().toISOString().split('T')[0],
                    attendantId: currentUser.uid,
                    attendantEmail: currentUser.email,
                    nozzleId: activeShift.nozzleId,
                    nozzleName: activeShift.nozzleName,
                    fuelType: activeShift.fuelType || "Unknown", // Added fuelType
                    startReading: activeShift.startReading,
                    endReading: endReading,
                    endReading: endReading,
                    totalLitres: totalLitres,
                    testingLitres: testingLitres, // Save testing litres
                    timestamp: serverTimestamp(),
                });
            });

            setSuccess("Job ended. Sent for verification.");
            setShowEndModal(false);
            setEndForm({ endReading: "", cashReturned: "", cashRemaining: "", cashOnline: "", change: "", testingLitres: "" });
        } catch (err) {
            console.error("Error ending job:", err);
            setError(err.message || "Failed to end job.");
        } finally {
            setSubmitting(false);
        }
    };

    // Handle Lend Cash
    const handleLendCash = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const amount = parseFloat(lendForm.amount);
            if (amount <= 0) throw new Error("Invalid amount");
            if (amount > userCashInHand) throw new Error("Insufficient cash in hand");

            const receiver = otherAttendants.find(u => u.id === lendForm.receiverId);

            // Just create the transfer record. Deduction happens on acceptance.
            await addDoc(collection(db, "cash_transfers"), {
                senderId: currentUser.uid,
                senderName: currentUser.email,
                receiverId: lendForm.receiverId,
                receiverName: receiver?.email || "Unknown",
                amount: amount,
                status: "Pending",
                timestamp: serverTimestamp()
            });

            setSuccess("Cash transfer request sent! Funds will be deducted when accepted.");
            setShowLendModal(false);
            setLendForm({ receiverId: "", amount: "" });
        } catch (err) {
            console.error("Error lending cash:", err);
            setError(err.message || "Failed to lend cash.");
        } finally {
            setSubmitting(false);
        }
    };

    // Handle Accept Transfer
    const handleAcceptTransfer = async (transfer) => {
        try {
            await runTransaction(db, async (transaction) => {
                // 1. READ: Get Transfer Doc (to ensure it's still pending)
                const transferRef = doc(db, "cash_transfers", transfer.id);
                const transferDoc = await transaction.get(transferRef);
                if (!transferDoc.exists()) throw new Error("Transfer not found");
                if (transferDoc.data().status !== "Pending") throw new Error("Transfer already processed");

                // 2. READ: Get Sender Data (Check balance now)
                const senderRef = doc(db, "users", transfer.senderId);
                const senderDoc = await transaction.get(senderRef);
                if (!senderDoc.exists()) throw new Error("Sender not found");

                const senderCash = senderDoc.data().cashInHand || 0;
                if (senderCash < transfer.amount) {
                    throw new Error("Sender has insufficient funds now.");
                }

                // 3. READ: Get Receiver Data
                const receiverRef = doc(db, "users", currentUser.uid);
                const receiverDoc = await transaction.get(receiverRef);
                if (!receiverDoc.exists()) throw new Error("Receiver not found");

                // 4. WRITE: Update Transfer Status
                transaction.update(transferRef, { status: "Accepted" });

                // 5. WRITE: Deduct from Sender
                transaction.update(senderRef, { cashInHand: senderCash - transfer.amount });

                // 6. WRITE: Add to Receiver
                const newReceiverCash = (receiverDoc.data().cashInHand || 0) + transfer.amount;
                transaction.update(receiverRef, { cashInHand: newReceiverCash });
            });
            setSuccess(`Accepted ₹${transfer.amount} from ${transfer.senderName}`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Error accepting transfer:", err);
            setError(err.message || "Failed to accept transfer.");
        }
    };

    // Handle Date Selection
    const handleDateSelect = async (date) => {
        setSelectedDate(date);

        // Client-side filtering to avoid "Index Required" error
        // We fetch recent shifts (e.g., last 50) and filter
        try {
            const shiftsQuery = query(
                collection(db, "shift_logs"),
                where("attendantId", "==", currentUser.uid),
                orderBy("startTime", "desc"),
                limit(50)
            );

            const snapshot = await getDocs(shiftsQuery);
            const allShifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const selectedDateString = date.toDateString();

            const shiftsForDate = allShifts.filter(shift => {
                const shiftDate = shift.startTime?.toDate ? shift.startTime.toDate() : new Date(shift.startTime);
                return shiftDate.toDateString() === selectedDateString;
            });

            setSelectedDateShifts(shiftsForDate);
            setShowHistoryModal(true);
        } catch (err) {
            console.error("Error fetching shifts for date:", err);
            setError("Failed to load history.");
        }
    };

    // Voice Command Handler
    useEffect(() => {
        if (lastCommand && lastCommand.type === 'SET_READING' && showEndModal) {
            setEndForm(prev => ({ ...prev, endReading: lastCommand.payload }));
            setSuccess(`Voice command: Set reading to ${lastCommand.payload}`);
            setTimeout(() => setSuccess(""), 3000);
        }
    }, [lastCommand, showEndModal]);

    // Handle Cancel Start Request
    const handleCancelStartRequest = async () => {
        if (!activeShift) return;
        if (!window.confirm("Are you sure you want to cancel this request?")) return;

        try {
            await runTransaction(db, async (transaction) => {
                const shiftRef = doc(db, "shift_logs", activeShift.id);
                const userRef = doc(db, "users", currentUser.uid);

                // 1. Delete Shift Log
                transaction.delete(shiftRef);

                // 2. Revert User Cash (subtract cashToHandle)
                const userDoc = await transaction.get(userRef);
                if (userDoc.exists()) {
                    const currentCash = userDoc.data().cashInHand || 0;
                    const cashToRevert = activeShift.cashToHandle || 0;
                    transaction.update(userRef, {
                        cashInHand: currentCash - cashToRevert
                    });
                }
            });
            setSuccess("Start request cancelled.");
        } catch (err) {
            console.error("Error cancelling request:", err);
            setError("Failed to cancel request.");
        }
    };


    // Monthly Stats State
    const [showStatsModal, setShowStatsModal] = useState(false);
    const [statsMonth, setStatsMonth] = useState(new Date().toISOString().slice(0, 7));
    const [myMonthlyStats, setMyMonthlyStats] = useState({ totalLitres: 0, totalCash: 0 });

    useEffect(() => {
        if (showStatsModal) {
            fetchMyStats();
        }
    }, [showStatsModal, statsMonth]);

    const fetchMyStats = async () => {
        try {
            const start = `${statsMonth}-01`;
            const end = `${statsMonth}-31`;

            const q = query(
                collection(db, "daily_sales"),
                where("attendantId", "==", currentUser.uid),
                where("date", ">=", start),
                where("date", "<=", end)
            );

            const snapshot = await getDocs(q);
            let litres = 0;
            // We can also calculate total cash handled if needed, but request was for fuel.
            // Let's do litres for now.

            snapshot.docs.forEach(doc => {
                litres += (doc.data().totalLitres || 0);
            });

            setMyMonthlyStats({ totalLitres: litres });
        } catch (err) {
            console.error("Error fetching stats:", err);
        }
    };

    if (loading) return <div className="min-h-screen bg-dark-bg text-white flex items-center justify-center">Loading...</div>;

    return (
        <div className="min-h-screen bg-dark-bg text-white p-4 pb-20 relative">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-xl font-bold text-primary-orange">Welcome, {currentUser.displayName || currentUser.email.split('@')[0]}</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <Wallet size={14} className="text-green-500" />
                        <span className="text-sm font-bold text-white">₹{userCashInHand}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowStatsModal(true)}
                        className="p-2 bg-gray-800 text-primary-orange rounded-lg hover:bg-gray-700 transition-colors"
                        title="Monthly Stats"
                    >
                        <Calculator size={20} />
                    </button>
                    <button
                        onClick={() => setShowLendModal(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-lg"
                    >
                        <ArrowRightLeft size={18} /> Lend
                    </button>

                    {!activeShift ? (
                        <button
                            onClick={() => setShowStartModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-lg animate-pulse"
                        >
                            <Play size={18} /> Start Job
                        </button>
                    ) : activeShift.status === "Active" ? (
                        <button
                            onClick={() => setShowEndModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold shadow-lg"
                        >
                            <Square size={18} /> End Job
                        </button>
                    ) : null}
                    <button onClick={logout} className="p-2 bg-red-600/20 text-red-500 rounded-lg hover:bg-red-600/30 transition-colors">
                        <LogOut size={20} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            {error && (
                <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg mb-6 text-sm flex items-center gap-2">
                    <AlertCircle size={16} /> {error}
                </div>
            )}
            {success && (
                <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded-lg mb-6 text-sm flex items-center gap-2">
                    <Save size={16} /> {success}
                </div>
            )}

            {/* Pending Transfers Notification */}
            {pendingTransfers.length > 0 && (
                <div className="mb-6 space-y-2">
                    {pendingTransfers.map(transfer => (
                        <div key={transfer.id} className="bg-blue-600/20 border border-blue-500 p-4 rounded-xl flex justify-between items-center animate-pulse">
                            <div>
                                <p className="text-blue-400 text-sm font-bold">Incoming Cash Transfer</p>
                                <p className="text-white">From: {transfer.senderName}</p>
                                <p className="text-xl font-bold text-white">₹{transfer.amount}</p>
                            </div>
                            <button
                                onClick={() => handleAcceptTransfer(transfer)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2"
                            >
                                <Check size={18} /> Accept
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Active Shift Display */}
            {activeShift && activeShift.status === "Active" ? (
                <div className="bg-card-bg p-6 rounded-xl border border-gray-800 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <Clock size={120} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-green-500 font-bold tracking-wider text-sm uppercase">Job Active</span>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-1">{activeShift.nozzleName}</h2>
                        <p className="text-gray-400 text-sm mb-6">Started at: {activeShift.startTime?.toDate ? activeShift.startTime.toDate().toLocaleTimeString() : new Date().toLocaleTimeString()}</p>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-900/50 p-4 rounded-lg">
                                <span className="text-gray-500 text-xs block mb-1">Start Reading</span>
                                <span className="text-xl font-mono font-bold text-primary-orange">{activeShift.startReading}</span>
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-lg">
                                <span className="text-gray-500 text-xs block mb-1">Cash in Hand</span>
                                <span className="text-xl font-mono font-bold text-white">₹{userCashInHand}</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : activeShift && activeShift.status === "PendingStartVerification" ? (
                <div className="flex flex-col items-center justify-center h-64 text-yellow-500 bg-card-bg rounded-xl border border-yellow-500/30 animate-pulse">
                    <Clock size={48} className="mb-4" />
                    <p className="text-lg font-bold">Waiting for Manager Approval</p>
                    <p className="text-sm text-gray-400 mb-4">Your request to START job is pending.</p>
                    <button
                        onClick={handleCancelStartRequest}
                        className="px-4 py-2 bg-red-600/20 text-red-500 rounded-lg hover:bg-red-600/30 text-sm font-bold flex items-center gap-2"
                    >
                        <X size={16} /> Cancel Request
                    </button>
                </div>
            ) : activeShift && activeShift.status === "PendingEndVerification" ? (
                <div className="flex flex-col items-center justify-center h-64 text-blue-500 bg-card-bg rounded-xl border border-blue-500/30 animate-pulse">
                    <Clock size={48} className="mb-4" />
                    <p className="text-lg font-bold">Waiting for Verification</p>
                    <p className="text-sm text-gray-400">Your request to END job is pending.</p>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-card-bg rounded-xl border border-gray-800 border-dashed">
                    <Fuel size={48} className="mb-4 opacity-50" />
                    <p className="text-lg">No active job.</p>
                    <p className="text-sm">Click "Start Job" to begin your shift.</p>
                </div>
            )}

            {/* Calendar Section */}
            {!activeShift && (
                <div className="mt-8 animate-fade-in">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <CalendarIcon size={20} className="text-primary-orange" /> Shift History
                    </h3>
                    <Calendar
                        onDateSelect={handleDateSelect}
                        highlightDates={shiftHistory}
                    />
                </div>
            )}

            {/* History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-md rounded-xl border border-gray-800 shadow-2xl animate-scale-in max-h-[80vh] overflow-y-auto">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                            <div>
                                <h3 className="text-lg font-bold text-white">
                                    {selectedDate?.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </h3>
                                <p className="text-xs text-gray-400">{selectedDateShifts.length} Shift(s) Found</p>
                            </div>
                            <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="p-4 space-y-4">
                            {selectedDateShifts.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    <Clock size={48} className="mx-auto mb-2 opacity-20" />
                                    <p>No shifts recorded for this date.</p>
                                </div>
                            ) : (
                                selectedDateShifts.map(shift => (
                                    <div key={shift.id} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h4 className="font-bold text-primary-orange">{shift.nozzleName}</h4>
                                                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">{shift.fuelType}</span>
                                            </div>
                                            <span className={`text-xs px-2 py-1 rounded-full font-bold ${shift.status === 'Active' ? 'bg-green-900 text-green-400' : 'bg-blue-900 text-blue-400'}`}>
                                                {shift.status}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-y-2 text-sm">
                                            <div className="text-gray-400">Time:</div>
                                            <div className="text-right text-white">
                                                {shift.startTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                                                {shift.endTime ? shift.endTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ongoing'}
                                            </div>

                                            <div className="text-gray-400">Net Sales:</div>
                                            <div className="text-right font-mono text-white">
                                                {((shift.totalLitres || 0) - (shift.testingLitres || 0)).toFixed(2)} L
                                            </div>

                                            {shift.testingLitres > 0 && (
                                                <>
                                                    <div className="text-gray-400 text-yellow-500">Testing:</div>
                                                    <div className="text-right font-mono text-yellow-500">
                                                        {shift.testingLitres.toFixed(2)} L
                                                    </div>
                                                </>
                                            )}

                                            <div className="text-gray-400">Cash Handled:</div>
                                            <div className="text-right font-mono text-green-400">₹{shift.cashToHandle || 0}</div>

                                            <div className="text-gray-400">Cash Remaining:</div>
                                            <div className="text-right font-mono text-white">₹{shift.cashRemaining || 0}</div>

                                            <div className="text-gray-400">Change Given:</div>
                                            <div className="text-right font-mono text-red-400">₹{shift.change || 0}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Modal */}
            {showStatsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-sm rounded-xl border border-gray-800 shadow-2xl animate-scale-in">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Calculator size={20} className="text-primary-orange" /> Monthly Stats
                            </h3>
                            <button onClick={() => setShowStatsModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Select Month</label>
                                <input
                                    type="month"
                                    value={statsMonth}
                                    onChange={(e) => setStatsMonth(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange"
                                />
                            </div>

                            <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 text-center">
                                <span className="text-gray-400 text-sm block mb-2">Total Fuel Sold</span>
                                <span className="text-4xl font-mono font-bold text-primary-orange">
                                    {myMonthlyStats.totalLitres.toFixed(2)}
                                </span>
                                <span className="text-gray-500 text-sm ml-2">Litres</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Start Job Modal */}
            {showStartModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-md rounded-xl border border-gray-800 shadow-2xl animate-scale-in">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Start New Job</h3>
                            <button onClick={() => setShowStartModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleStartJob} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Select Nozzle</label>
                                <select
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={startForm.nozzleId}
                                    onChange={e => setStartForm({ ...startForm, nozzleId: e.target.value })}
                                >
                                    <option value="">-- Choose Nozzle --</option>
                                    {nozzles.map(n => (
                                        <option key={n.id} value={n.id}>{n.nozzleName} ({n.fuelType})</option>
                                    ))}
                                </select>
                            </div>
                            {startForm.nozzleId && (
                                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                    <span className="text-xs text-gray-500 block">Last Reading</span>
                                    <span className="text-lg font-mono font-bold text-primary-orange">
                                        {nozzles.find(n => n.id === startForm.nozzleId)?.currentMeterReading}
                                    </span>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Cash to Handle (₹)</label>
                                <input
                                    type="number"
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={startForm.cashToHandle}
                                    onChange={e => setStartForm({ ...startForm, cashToHandle: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Previous Cash in Hand (₹)</label>
                                <input
                                    type="number"
                                    disabled
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-400 font-bold cursor-not-allowed"
                                    value={userCashInHand}
                                />
                                <p className="text-xs text-gray-500 mt-1">Auto-filled from database</p>
                            </div>
                            <button type="submit" disabled={submitting} className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700">
                                {submitting ? "Starting..." : "Start Job"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* End Job Modal */}
            {showEndModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-md rounded-xl border border-gray-800 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">End Job & Submit</h3>
                            <button onClick={() => setShowEndModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleEndJob} className="p-4 space-y-4">
                            <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700 mb-4">
                                <span className="text-xs text-gray-500 block">Start Reading</span>
                                <span className="text-lg font-mono font-bold text-gray-300">{activeShift?.startReading}</span>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">End Reading</label>
                                <input
                                    type="number"
                                    required
                                    step="0.01"
                                    min={activeShift?.startReading}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange font-mono text-lg"
                                    value={endForm.endReading}
                                    onChange={e => setEndForm({ ...endForm, endReading: e.target.value })}
                                    placeholder="00000.00"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Testing (Litres)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange font-mono text-lg"
                                    value={endForm.testingLitres}
                                    onChange={e => setEndForm({ ...endForm, testingLitres: e.target.value })}
                                    placeholder="0.00"
                                />
                                <p className="text-xs text-gray-500 mt-1">Fuel pumped for testing (returned to tank)</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Cash Returned</label>
                                    <input
                                        type="number"
                                        required
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                        value={endForm.cashReturned}
                                        onChange={e => setEndForm({ ...endForm, cashReturned: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Cash Remaining</label>
                                    <input
                                        type="number"
                                        required
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                        value={endForm.cashRemaining}
                                        onChange={e => setEndForm({ ...endForm, cashRemaining: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Cash Online</label>
                                    <input
                                        type="number"
                                        required
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                        value={endForm.cashOnline}
                                        onChange={e => setEndForm({ ...endForm, cashOnline: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Change</label>
                                    <input
                                        type="number"
                                        required
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                        value={endForm.change}
                                        onChange={e => setEndForm({ ...endForm, change: e.target.value })}
                                    />
                                </div>
                            </div>
                            <button type="submit" disabled={submitting} className="w-full py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">
                                {submitting ? "Submitting..." : "Submit for Verification"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Lend Cash Modal */}
            {showLendModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-md rounded-xl border border-gray-800 shadow-2xl animate-scale-in">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Lend Cash to Staff</h3>
                            <button onClick={() => setShowLendModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleLendCash} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Select Staff Member</label>
                                <select
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={lendForm.receiverId}
                                    onChange={e => setLendForm({ ...lendForm, receiverId: e.target.value })}
                                >
                                    <option value="">-- Choose Staff --</option>
                                    {otherAttendants.map(u => (
                                        <option key={u.id} value={u.id}>{u.email}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Amount to Lend (₹)</label>
                                <input
                                    type="number"
                                    required
                                    max={userCashInHand}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={lendForm.amount}
                                    onChange={e => setLendForm({ ...lendForm, amount: e.target.value })}
                                    placeholder="0.00"
                                />
                                <p className="text-xs text-gray-500 mt-1">Available: ₹{userCashInHand}</p>
                            </div>
                            <button type="submit" disabled={submitting} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">
                                {submitting ? "Sending..." : "Send Cash"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

