import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../firebase";
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where, orderBy, limit, runTransaction, onSnapshot } from "firebase/firestore";
import { LogOut, Fuel, Save, Calculator, AlertCircle, Mic, Play, Square, Clock, Wallet, X, ArrowRightLeft, Check, User, Calendar as CalendarIcon, CreditCard, Truck } from "lucide-react";
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
    const [customers, setCustomers] = useState([]); // Added customers state

    // Modals
    const [showStartModal, setShowStartModal] = useState(false);
    const [showEndModal, setShowEndModal] = useState(false);
    const [showLendModal, setShowLendModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showCreditModal, setShowCreditModal] = useState(false); // Added Credit Modal

    // History State
    const [shiftHistory, setShiftHistory] = useState([]); // Array of Date objects
    const [selectedDateShifts, setSelectedDateShifts] = useState([]);
    const [selectedDate, setSelectedDate] = useState(null);

    // Forms
    const [startForm, setStartForm] = useState({
        selectedNozzleIds: [],
        cashToHandle: "",
        previousCashInHand: "" // Will be autofilled
    });

    const [endForm, setEndForm] = useState({
        readings: {}, // Map nozzleId -> { endReading: val, testingLitres: val }
        cashReturned: "",
        cashRemaining: "",
        cashRemaining: "",
        // cashOnline removed
        paytm: "",
        phonePe: "",
        expenses: "", // Separate from change
        change: ""
    });

    const [lendForm, setLendForm] = useState({
        receiverId: "",
        amount: ""
    });

    const [creditForm, setCreditForm] = useState({
        customerId: "",
        vehicleNumber: "",
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

                // 3. Fetch Customers (for Credit Sales)
                const customersSnapshot = await getDocs(collection(db, "customers"));
                setCustomers(customersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

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
            if (startForm.selectedNozzleIds.length === 0) {
                throw new Error("Please select at least one nozzle");
            }

            const selectedNozzles = nozzles.filter(n => startForm.selectedNozzleIds.includes(n.id));
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

                // Construct nozzles array for the shift
                const shiftNozzles = selectedNozzles.map(n => ({
                    nozzleId: n.id,
                    nozzleName: n.nozzleName,
                    fuelType: n.fuelType,
                    startReading: n.currentMeterReading,
                    endReading: n.currentMeterReading, // Init
                    totalLitres: 0,
                    testingLitres: 0
                }));

                const primaryNozzle = selectedNozzles[0];

                transaction.set(shiftRef, {
                    attendantId: currentUser.uid,
                    attendantName: currentUser.email,
                    startTime: serverTimestamp(),

                    // Legacy/Summary fields
                    nozzleId: primaryNozzle.id,
                    nozzleName: selectedNozzles.map(n => n.nozzleName).join(", "),
                    fuelType: selectedNozzles.length > 1 ? "Mixed" : primaryNozzle.fuelType,
                    startReading: primaryNozzle.currentMeterReading, // Just for summary/legacy

                    // New Data Structure
                    nozzles: shiftNozzles,

                    cashToHandle: cashToHandle,
                    previousCashInHand: currentDbCash,
                    status: "Active",
                    startVerified: false
                });

                // 3. Update User Cash in Hand
                transaction.update(userRef, { cashInHand: newCash });
            });

            setSuccess("Job started successfully!");
            setShowStartModal(false);
            setStartForm({ selectedNozzleIds: [], cashToHandle: "", previousCashInHand: startForm.previousCashInHand });
        } catch (err) {
            console.error("Error starting job:", err);
            setError(err.message || "Failed to start job.");
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
            // Normalize shift nozzles (Legacy vs Multi)
            const shiftNozzles = activeShift.nozzles || [{
                nozzleId: activeShift.nozzleId,
                nozzleName: activeShift.nozzleName,
                fuelType: activeShift.fuelType,
                startReading: activeShift.startReading
            }];

            const updatedNozzles = [];
            let totalLitres = 0;
            let totalTestingLitres = 0;

            // Validate and prepare data
            for (const nozzle of shiftNozzles) {
                const readingData = endForm.readings[nozzle.nozzleId] || {};
                const endReading = parseFloat(readingData.endReading);

                if (isNaN(endReading)) throw new Error(`Enter end reading for ${nozzle.nozzleName}`);
                if (endReading < nozzle.startReading) {
                    throw new Error(`End reading cannot be less than start reading for ${nozzle.nozzleName}`);
                }

                const testing = parseFloat(readingData.testingLitres) || 0;
                const nozzleSales = endReading - nozzle.startReading;
                const netNozzleSales = nozzleSales - testing;

                totalLitres += nozzleSales; // Sum of gross sales
                totalTestingLitres += testing;

                updatedNozzles.push({
                    ...nozzle,
                    endReading,
                    totalLitres: nozzleSales,
                    testingLitres: testing,
                    netLitres: netNozzleSales
                });
            }

            const netLitres = totalLitres - totalTestingLitres;
            const cashRemaining = parseFloat(endForm.cashRemaining) || 0;

            // Fetch tanks for all needed fuel types
            const neededFuelTypes = [...new Set(shiftNozzles.map(n => n.fuelType))];
            const tanksQuery = query(collection(db, "tanks"), where("fuelType", "in", neededFuelTypes));
            const tanksSnapshot = await getDocs(tanksQuery);
            const tanks = tanksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            await runTransaction(db, async (transaction) => {
                // 1. READ: Get Tanks first (Rule: Reads before Writes)
                const tankMap = {};
                for (const t of tanks) {
                    const tankRef = doc(db, "tanks", t.id);
                    const tankDoc = await transaction.get(tankRef);
                    if (tankDoc.exists()) {
                        tankMap[t.fuelType] = { ref: tankRef, data: tankDoc.data() };
                    }
                }

                // 2. WRITE: Update Shift Log
                const shiftRef = doc(db, "shift_logs", activeShift.id);
                transaction.update(shiftRef, {
                    endTime: serverTimestamp(),

                    // Legacy Support (Use sums/aggregates)
                    endReading: 0, // Not applicable for multi
                    totalLitres: totalLitres,
                    testingLitres: totalTestingLitres,
                    netLitres: netLitres,

                    // New Data
                    nozzles: updatedNozzles,

                    cashReturned: parseFloat(endForm.cashReturned) || 0,
                    cashRemaining: cashRemaining,
                    // cashOnline deprecated in favor of specific modes
                    paytm: parseFloat(endForm.paytm) || 0,
                    phonePe: parseFloat(endForm.phonePe) || 0,
                    expenses: parseFloat(endForm.expenses) || 0,
                    change: parseFloat(endForm.change) || 0,
                    status: "PendingEndVerification"
                });

                // 3. WRITE: Update Nozzles (Loop)
                for (const nozzle of updatedNozzles) {
                    const nozzleRef = doc(db, "nozzles", nozzle.nozzleId);
                    transaction.update(nozzleRef, {
                        currentMeterReading: nozzle.endReading
                    });
                }

                // 4. WRITE: Update User Cash in Hand
                const userRef = doc(db, "users", currentUser.uid);
                transaction.update(userRef, {
                    cashInHand: cashRemaining
                });

                // 5. WRITE: Add to Daily Sales (Loop per nozzle)
                const today = new Date().toISOString().split('T')[0];
                for (const nozzle of updatedNozzles) {
                    const salesRef = doc(collection(db, "daily_sales"));
                    transaction.set(salesRef, {
                        date: today,
                        attendantId: currentUser.uid,
                        attendantEmail: currentUser.email,
                        nozzleId: nozzle.nozzleId,
                        nozzleName: nozzle.nozzleName,
                        fuelType: nozzle.fuelType,
                        startReading: nozzle.startReading,
                        endReading: nozzle.endReading,
                        totalLitres: nozzle.totalLitres, // Gross
                        testingLitres: nozzle.testingLitres,
                        netLitres: nozzle.netLitres,
                        timestamp: serverTimestamp(),
                    });
                }

                // 6. WRITE: Update Tank Stock (Decrement)
                // Aggregate decrement per fuel type first
                const tankUpdates = {};
                for (const nozzle of updatedNozzles) {
                    if (!tankUpdates[nozzle.fuelType]) tankUpdates[nozzle.fuelType] = 0;
                    tankUpdates[nozzle.fuelType] += nozzle.totalLitres; // Gross leaves tank
                }

                for (const [fuelType, amount] of Object.entries(tankUpdates)) {
                    if (tankMap[fuelType]) {
                        const { ref, data } = tankMap[fuelType];
                        const currentLevel = data.currentLevel || 0;
                        transaction.update(ref, {
                            currentLevel: currentLevel - amount
                        });
                    }
                }
            });

            setSuccess("Job ended. Sent for verification.");
            setShowEndModal(false);
            setEndForm({ readings: {}, cashReturned: "", cashRemaining: "", paytm: "", phonePe: "", expenses: "", change: "" });
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
            // 1. Fetch Shifts
            const shiftsQuery = query(
                collection(db, "shift_logs"),
                where("attendantId", "==", currentUser.uid),
                orderBy("startTime", "desc"),
                limit(50)
            );

            // 2. Fetch Credit Transactions (Recent)
            const creditQuery = query(
                collection(db, "credit_transactions"),
                where("loggedBy", "==", currentUser.uid),
                orderBy("date", "desc"),
                limit(50)
            );

            const [shiftsSnapshot, creditSnapshot] = await Promise.all([
                getDocs(shiftsQuery),
                getDocs(creditQuery)
            ]);

            const allShifts = shiftsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const allCredits = creditSnapshot.docs.map(doc => doc.data());

            const selectedDateString = date.toDateString();

            // Filter Shifts
            const shiftsForDate = allShifts.filter(shift => {
                const shiftDate = shift.startTime?.toDate ? shift.startTime.toDate() : new Date(shift.startTime);
                return shiftDate.toDateString() === selectedDateString;
            });

            // Map Credits to Shifts
            const shiftsWithCredit = shiftsForDate.map(shift => {
                const start = shift.startTime?.toDate ? shift.startTime.toDate().getTime() : new Date(shift.startTime).getTime();
                const end = shift.endTime?.toDate ? shift.endTime.toDate().getTime() : new Date().getTime(); // Assume active/ended now if no end time

                const shiftCredits = allCredits.filter(c => {
                    const cDate = c.date?.toDate ? c.date.toDate() : new Date(c.date);
                    const cTime = cDate.getTime();
                    // Match transaction time to Shift Window (with 5 min buffer)
                    return cTime >= start && cTime <= (end + 300000);
                });

                const creditTotal = shiftCredits.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
                return { ...shift, creditSales: creditTotal };
            });

            setSelectedDateShifts(shiftsWithCredit);
            setShowHistoryModal(true);
        } catch (err) {
            console.error("Error fetching history data:", err);
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

    // Handle Credit Sale
    const handleCreditSale = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const amount = parseFloat(creditForm.amount);
            if (!amount || amount <= 0) throw new Error("Invalid amount");
            if (!creditForm.customerId) throw new Error("Please select a customer");

            const customer = customers.find(c => c.id === creditForm.customerId);
            if (!customer) throw new Error("Customer not found");

            // Check Credit Limit
            const currentBalance = customer.outstandingBalance || 0;
            const limit = customer.creditLimit || 0;
            if (currentBalance + amount > limit) {
                throw new Error(`Credit limit exceeded! Available: ₹${(limit - currentBalance).toFixed(2)}`);
            }

            // Find Vehicle Details
            let vehicleDetails = {
                vehicleNumber: creditForm.vehicleNumber || "N/A",
                vehicleModel: "Unknown",
                fuelType: "Unknown"
            };

            if (customer.vehicles) {
                const foundVehicle = customer.vehicles.find(v => {
                    const plate = typeof v === 'object' ? v.plateNumber : v;
                    return plate === creditForm.vehicleNumber;
                });
                if (foundVehicle && typeof foundVehicle === 'object') {
                    vehicleDetails = {
                        vehicleNumber: foundVehicle.plateNumber,
                        vehicleModel: foundVehicle.vehicleModel || "Unknown",
                        fuelType: foundVehicle.fuelType || "Unknown"
                    };
                } else if (foundVehicle) {
                    vehicleDetails.vehicleNumber = foundVehicle;
                }
            }

            await runTransaction(db, async (transaction) => {
                // 0. READ: Get Daily Sheet (Must be before writes)
                const todayStr = new Date().toISOString().split('T')[0];
                const sheetRef = doc(db, "daily_sheets", todayStr);
                const sheetDoc = await transaction.get(sheetRef);

                // 1. Create Credit Transaction
                const transactionRef = doc(collection(db, "credit_transactions"));
                transaction.set(transactionRef, {
                    customerId: customer.id,
                    customerName: customer.name,
                    ...vehicleDetails,
                    amount: amount,
                    date: serverTimestamp(),
                    status: "Completed",
                    loggedBy: currentUser.uid,
                    loggedByName: currentUser.email
                });

                // 2. Update Customer Balance
                const customerRef = doc(db, "customers", customer.id);
                transaction.update(customerRef, {
                    outstandingBalance: (customer.outstandingBalance || 0) + amount
                });

                // 3. Update Daily Sheet (if exists)
                if (sheetDoc.exists()) {
                    const sheetData = sheetDoc.data();
                    const updatedPayments = sheetData.payments.map(p => {
                        if (p.type === "Credit") {
                            return { ...p, amount: (parseFloat(p.amount) || 0) + amount };
                        }
                        return p;
                    });
                    const totalPayment = updatedPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                    const netCollection = totalPayment - (sheetData.totalExpense || 0);

                    transaction.update(sheetRef, {
                        payments: updatedPayments,
                        totalPayment,
                        netCollection,
                        updatedAt: new Date().toISOString()
                    });
                }
            });

            setSuccess("Credit sale logged successfully!");
            setShowCreditModal(false);
            setCreditForm({ customerId: "", vehicleNumber: "", amount: "" });

            // Refresh customers to get new balance
            const customersSnapshot = await getDocs(collection(db, "customers"));
            setCustomers(customersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        } catch (err) {
            console.error("Error logging credit sale:", err);
            setError(err.message || "Failed to log credit sale.");
        } finally {
            setSubmitting(false);
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
                    <button
                        onClick={() => setShowCreditModal(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold shadow-lg"
                        title="Log Credit Sale"
                    >
                        <CreditCard size={18} /> Credit
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

                        {/* Nozzle List */}
                        <div className="mb-6 space-y-3">
                            {(activeShift.nozzles || [{
                                nozzleName: activeShift.nozzleName,
                                startReading: activeShift.startReading,
                                fuelType: activeShift.fuelType
                            }]).map((n, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                                    <div>
                                        <h2 className="text-lg font-bold text-white">{n.nozzleName}</h2>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${n.fuelType === 'Petrol' ? 'bg-orange-900 text-orange-200' : 'bg-blue-900 text-blue-200'}`}>
                                            {n.fuelType}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-gray-500 text-xs block">Start</span>
                                        <span className="text-lg font-mono font-bold text-primary-orange">{n.startReading}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <p className="text-gray-400 text-sm mb-6 flex items-center gap-2">
                            <Clock size={14} />
                            Started at: {activeShift.startTime?.toDate ? activeShift.startTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString()}
                        </p>

                        <div className="bg-gray-900/50 p-4 rounded-lg">
                            <span className="text-gray-500 text-xs block mb-1">Cash in Hand</span>
                            <span className="text-xl font-mono font-bold text-white">₹{userCashInHand}</span>
                        </div>


                    </div>
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

                                            <div className="text-gray-400">Online Sales:</div>
                                            <div className="text-right font-mono text-blue-400">₹{shift.cashOnline || 0}</div>

                                            <div className="text-gray-400">Credit Sales:</div>
                                            <div className="text-right font-mono text-orange-400">₹{shift.creditSales || 0}</div>

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
                                <label className="block text-sm text-gray-400 mb-2">Select Nozzles</label>
                                <div className="space-y-2 max-h-48 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg p-3">
                                    {nozzles.map(n => (
                                        <div key={n.id} className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded">
                                            <input
                                                type="checkbox"
                                                id={`nozzle-${n.id}`}
                                                checked={startForm.selectedNozzleIds.includes(n.id)}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setStartForm(prev => {
                                                        const newIds = checked
                                                            ? [...prev.selectedNozzleIds, n.id]
                                                            : prev.selectedNozzleIds.filter(id => id !== n.id);
                                                        return { ...prev, selectedNozzleIds: newIds };
                                                    });
                                                }}
                                                className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-primary-orange focus:ring-primary-orange"
                                            />
                                            <label htmlFor={`nozzle-${n.id}`} className="flex-1 cursor-pointer">
                                                <div className="font-bold text-white text-sm">{n.nozzleName}</div>
                                                <div className="flex justify-between items-center mt-1">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${n.fuelType === 'Petrol' ? 'bg-orange-900 text-orange-200' : 'bg-blue-900 text-blue-200'}`}>
                                                        {n.fuelType}
                                                    </span>
                                                    <span className="text-xs font-mono text-gray-400">
                                                        {n.currentMeterReading}
                                                    </span>
                                                </div>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-1 text-right">
                                    {startForm.selectedNozzleIds.length} Selected
                                </p>
                            </div>
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

            {/* Credit Sale Modal */}
            {showCreditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-md rounded-xl border border-gray-800 shadow-2xl animate-scale-in">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <CreditCard size={20} className="text-primary-orange" /> Credit Sale
                            </h3>
                            <button onClick={() => setShowCreditModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCreditSale} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Select Customer</label>
                                <select
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={creditForm.customerId}
                                    onChange={e => setCreditForm({ ...creditForm, customerId: e.target.value, vehicleNumber: "" })}
                                >
                                    <option value="">-- Choose Customer --</option>
                                    {customers.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            {creditForm.customerId && (
                                <>
                                    <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                                        <span className="text-xs text-gray-500">Available Limit</span>
                                        <span className={`font-bold ${(customers.find(c => c.id === creditForm.customerId)?.creditLimit || 0) - (customers.find(c => c.id === creditForm.customerId)?.outstandingBalance || 0) < 1000
                                            ? 'text-red-500'
                                            : 'text-green-500'
                                            }`}>
                                            ₹{((customers.find(c => c.id === creditForm.customerId)?.creditLimit || 0) - (customers.find(c => c.id === creditForm.customerId)?.outstandingBalance || 0)).toLocaleString()}
                                        </span>
                                    </div>

                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Select Vehicle</label>
                                        <div className="relative">
                                            <Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                            <select
                                                required
                                                className="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white appearance-none"
                                                value={creditForm.vehicleNumber}
                                                onChange={e => setCreditForm({ ...creditForm, vehicleNumber: e.target.value })}
                                            >
                                                <option value="">-- Select Vehicle --</option>
                                                {customers.find(c => c.id === creditForm.customerId)?.vehicles?.map((v, idx) => {
                                                    const plate = typeof v === 'object' ? v.plateNumber : v;
                                                    const model = typeof v === 'object' ? v.vehicleModel : '';
                                                    return <option key={idx} value={plate}>{plate} {model ? `- ${model}` : ''}</option>;
                                                })}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Amount (₹)</label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange font-mono text-lg"
                                            value={creditForm.amount}
                                            onChange={e => setCreditForm({ ...creditForm, amount: e.target.value })}
                                            placeholder="0.00"
                                        />
                                    </div>

                                    <button type="submit" disabled={submitting} className="w-full py-3 bg-primary-orange text-white font-bold rounded-lg hover:bg-orange-600 shadow-lg mt-2">
                                        {submitting ? "Processing..." : "Confirm Sale"}
                                    </button>
                                </>
                            )}
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

                            {/* Nozzle Readings Inputs */}
                            <div className="space-y-4">
                                {(activeShift.nozzles || [{
                                    nozzleId: activeShift.nozzleId,
                                    nozzleName: activeShift.nozzleName,
                                    startReading: activeShift.startReading
                                }]).map(nozzle => (
                                    <div key={nozzle.nozzleId} className="bg-gray-800/30 p-4 rounded-xl border border-gray-700">
                                        <h4 className="font-bold text-primary-orange mb-3 text-sm flex justify-between">
                                            {nozzle.nozzleName}
                                            <span className="text-gray-500 font-normal">Start: {nozzle.startReading}</span>
                                        </h4>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">End Reading</label>
                                                <input
                                                    type="number"
                                                    required
                                                    step="0.01"
                                                    min={nozzle.startReading}
                                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-primary-orange font-mono"
                                                    value={endForm.readings[nozzle.nozzleId]?.endReading || ""}
                                                    onChange={e => setEndForm(prev => ({
                                                        ...prev,
                                                        readings: {
                                                            ...prev.readings,
                                                            [nozzle.nozzleId]: {
                                                                ...prev.readings[nozzle.nozzleId],
                                                                endReading: e.target.value
                                                            }
                                                        }
                                                    }))}
                                                    placeholder="00000.00"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Testing (L)</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-primary-orange font-mono"
                                                    value={endForm.readings[nozzle.nozzleId]?.testingLitres || ""}
                                                    onChange={e => setEndForm(prev => ({
                                                        ...prev,
                                                        readings: {
                                                            ...prev.readings,
                                                            [nozzle.nozzleId]: {
                                                                ...prev.readings[nozzle.nozzleId],
                                                                testingLitres: e.target.value
                                                            }
                                                        }
                                                    }))}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-800">
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
                                    <label className="block text-sm text-gray-400 mb-1">Paytm Received</label>
                                    <div className="relative">
                                        <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                        <input
                                            type="number"
                                            required
                                            value={endForm.paytm}
                                            onChange={e => setEndForm({ ...endForm, paytm: e.target.value })}
                                            className="w-full pl-10 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">PhonePe Received</label>
                                    <div className="relative">
                                        <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                        <input
                                            type="number"
                                            required
                                            value={endForm.phonePe}
                                            onChange={e => setEndForm({ ...endForm, phonePe: e.target.value })}
                                            className="w-full pl-10 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Expenses (Tea/Misc)</label>
                                    <input
                                        type="number"
                                        required
                                        value={endForm.expenses}
                                        onChange={e => setEndForm({ ...endForm, expenses: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Change Given / Float</label>
                                    <input
                                        type="number"
                                        required
                                        value={endForm.change}
                                        onChange={e => setEndForm({ ...endForm, change: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-orange"
                                        placeholder="0.00"
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

