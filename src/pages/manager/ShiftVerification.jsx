import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs, getDoc, doc, updateDoc, query, where, onSnapshot, orderBy, runTransaction, serverTimestamp, addDoc, Timestamp } from "firebase/firestore";
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

    // Manager Start Job State
    const [nozzles, setNozzles] = useState([]);
    const [showManagerStartModal, setShowManagerStartModal] = useState(false);
    const [selectedAttendant, setSelectedAttendant] = useState(null);
    const [startJobForm, setStartJobForm] = useState({
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        selectedNozzleIds: [],
        cashToHandle: "",
        readings: {} // nozzleId: startReading
    });

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

    // 6. Fetch Nozzles for Manager Start
    useEffect(() => {
        const fetchNozzles = async () => {
            const q = query(collection(db, "nozzles"), orderBy("nozzleName"));
            const snapshot = await getDocs(q);
            setNozzles(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchNozzles();
    }, []);

    // Open Start Modal
    const openStartModal = (shift) => {
        setSelectedShift(shift);

        // Prepare readings map
        const nozzles = shift.nozzles || [{ nozzleId: shift.nozzleId, startReading: shift.startReading }];
        const initialReadings = {};
        nozzles.forEach(n => {
            initialReadings[n.nozzleId] = { startReading: n.startReading };
        });

        setEditForm({
            readings: initialReadings,
            cashToHandle: shift.cashToHandle
        });
        setShowStartModal(true);
    };

    // Open End Modal (Approve Staff Request)
    const openEndModal = (shift) => {
        setSelectedShift(shift);
        const nozzles = shift.nozzles || [{ nozzleId: shift.nozzleId, nozzleName: shift.nozzleName, endReading: shift.endReading, testingLitres: shift.testingLitres }];
        const initialReadings = {};
        nozzles.forEach(n => {
            initialReadings[n.nozzleId] = {
                endReading: n.endReading,
                testingLitres: n.testingLitres
            };
        });
        setEditForm({
            readings: initialReadings,
            cashReturned: shift.cashReturned,
            cashRemaining: shift.cashRemaining,
            paytm: shift.paytm || 0,
            phonePe: shift.phonePe || 0,
            expenses: shift.expenses || 0,
            change: shift.change
        });
        setShowEndModal(true);
    };

    // Open Manager End Modal (Force End Active Shift)
    const openManagerEndModal = (shift) => {
        setSelectedShift(shift);
        const nozzles = shift.nozzles || [{ nozzleId: shift.nozzleId, nozzleName: shift.nozzleName, startReading: shift.startReading }];
        const initialReadings = {};
        nozzles.forEach(n => {
            initialReadings[n.nozzleId] = {
                endReading: n.startReading, // Default to start
                testingLitres: 0
            };
        });
        setEditForm({
            readings: initialReadings,
            cashReturned: "",
            paytm: "",
            phonePe: "",
            expenses: "",
            change: ""
        });
        setShowManagerEndModal(true);
    };

    // Open Manager Start Modal
    const openManagerStartModal = (attendant) => {
        setSelectedAttendant(attendant);
        const now = new Date();
        setStartJobForm({
            date: now.toISOString().split('T')[0],
            time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            selectedNozzleIds: [],
            cashToHandle: "",
            readings: {}
        });
        setShowManagerStartModal(true);
    };

    // Handle Approve Start
    const handleApproveStart = async (e) => {
        e.preventDefault();
        setProcessing(true);
        setError("");

        try {
            const cashToHandle = parseFloat(editForm.cashToHandle) || 0;

            // Re-calculate user cash:
            const originalCashAdded = selectedShift.cashToHandle || 0;
            const diff = cashToHandle - originalCashAdded;

            // Prepare updated nozzles
            const shiftNozzles = selectedShift.nozzles || [{ ...selectedShift }];
            const updatedNozzles = shiftNozzles.map(n => {
                const readingKey = n.nozzleId || n.id;
                const newStart = parseFloat(editForm.readings[readingKey]?.startReading);
                if (isNaN(newStart)) throw new Error(`Invalid start reading for ${n.nozzleName}`);
                return { ...n, startReading: newStart, endReading: newStart }; // Reset endReading to match start
            });

            // Primary/Legacy Start Reading (e.g. Total or First)
            // We just keep the legacy field as is or update it to first nozzle's.
            const primaryStart = updatedNozzles[0].startReading;

            await runTransaction(db, async (transaction) => {
                const shiftRef = doc(db, "shift_logs", selectedShift.id);
                const userRef = doc(db, "users", selectedShift.attendantId);
                const userDoc = await transaction.get(userRef);

                if (!userDoc.exists()) throw new Error("User not found");

                const newCashInHand = (userDoc.data().cashInHand || 0) + diff;

                transaction.update(shiftRef, {
                    startVerified: true,
                    cashToHandle: cashToHandle,
                    verifiedAt: serverTimestamp(),

                    // Update Nozzles
                    nozzles: selectedShift.nozzles ? updatedNozzles : null, // Only update array if it was array

                    // Legacy Support
                    startReading: primaryStart,
                    // If legacy shift, we also need to update root fields:
                    ...(selectedShift.nozzles ? {} : { startReading: primaryStart })
                });

                transaction.update(userRef, {
                    cashInHand: newCashInHand
                });
            });

            setSuccess("Shift START approved successfully!");
            setShowStartModal(false);
        } catch (err) {
            console.error("Error approving start:", err);
            setError(err.message || "Failed to approve start.");
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
            // Prepare updated nozzles from form data
            const shiftNozzles = selectedShift.nozzles || [{
                nozzleId: selectedShift.nozzleId,
                nozzleName: selectedShift.nozzleName,
                fuelType: selectedShift.fuelType,
                startReading: selectedShift.startReading
            }];

            const updatedNozzles = [];
            let totalLitres = 0; // Gross litres from all nozzles
            let totalTestingLitres = 0;
            let totalNetLitres = 0;

            for (const nozzle of shiftNozzles) {
                const readingKey = nozzle.nozzleId || nozzle.id; // handle inconsistency
                const inputs = editForm.readings[readingKey] || {};

                const endReading = parseFloat(inputs.endReading);
                if (isNaN(endReading)) throw new Error(`Enter end reading for ${nozzle.nozzleName}`);
                if (endReading < nozzle.startReading) throw new Error(`End reading cannot be less than start reading for ${nozzle.nozzleName}`);

                const testing = parseFloat(inputs.testingLitres) || 0;
                const sales = endReading - nozzle.startReading;
                const net = sales - testing;

                totalLitres += sales;
                totalTestingLitres += testing;
                totalNetLitres += net;

                updatedNozzles.push({
                    ...nozzle,
                    endReading,
                    testingLitres: testing,
                    totalLitres: sales,
                    netLitres: net
                });
            }

            // Financials - Updated for Splitting
            const cashReturned = parseFloat(editForm.cashReturned) || 0;
            const cashRemaining = parseFloat(editForm.cashRemaining) || 0;
            // cashOnline deprecated
            const paytm = parseFloat(editForm.paytm) || 0;
            const phonePe = parseFloat(editForm.phonePe) || 0;
            const expenses = parseFloat(editForm.expenses) || 0;
            const change = parseFloat(editForm.change) || 0;

            // Fetch Prices
            const pricesSnapshot = await getDocs(collection(db, "prices"));
            const pricesMap = {};
            pricesSnapshot.forEach(doc => { pricesMap[doc.id] = doc.data().rate; }); // Assuming doc.id is fuelType

            let expectedAmount = 0;
            updatedNozzles.forEach(n => {
                const price = pricesMap[n.fuelType] || 0;
                expectedAmount += (n.netLitres * price);
            });

            // Total Deposited now includes separated payments + expenses (as it's money accounted for)
            const totalDeposited = cashReturned + paytm + phonePe + expenses + change;
            const shortage = expectedAmount - totalDeposited;

            // Fetch Tanks
            const neededFuelTypes = [...new Set(updatedNozzles.map(n => n.fuelType))];
            const tanksQuery = query(collection(db, "tanks"), where("fuelType", "in", neededFuelTypes));
            const tanksSnapshot = await getDocs(tanksQuery);
            const tanks = tanksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            await runTransaction(db, async (transaction) => {
                // 1. READ: Get Tanks First
                const tankMap = {};
                for (const t of tanks) {
                    const tankRef = doc(db, "tanks", t.id);
                    const tankDoc = await transaction.get(tankRef);
                    if (tankDoc.exists()) {
                        tankMap[t.fuelType] = { ref: tankRef, data: tankDoc.data() };
                    }
                }

                // 2. WRITE: Update Shift Log
                const shiftRef = doc(db, "shift_logs", selectedShift.id);
                transaction.update(shiftRef, {
                    status: "Completed",
                    endVerified: true,
                    verifiedAt: serverTimestamp(),

                    // Helper aggregates
                    totalLitres,
                    netLitres: totalNetLitres,
                    testingLitres: totalTestingLitres,
                    amount: expectedAmount,
                    shortage: shortage,

                    // New Data
                    nozzles: updatedNozzles,

                    // Legacy fields update?
                    endReading: updatedNozzles.length === 1 ? updatedNozzles[0].endReading : 0, // Keep legacy field for single nozzle
                    totalLitres: updatedNozzles.length === 1 ? updatedNozzles[0].totalLitres : 0, // Keep legacy field for single nozzle

                    cashReturned, cashRemaining, change,
                    paytm, phonePe, expenses, // Save broken down fields
                    cashOnline: (paytm + phonePe) // Keep legacy agg for display if needed
                });

                // 2. Update Nozzles
                for (const nozzle of updatedNozzles) {
                    const nozzleRef = doc(db, "nozzles", nozzle.nozzleId);
                    transaction.update(nozzleRef, { currentMeterReading: nozzle.endReading });
                }

                // 3. User Cash
                const userRef = doc(db, "users", selectedShift.attendantId);
                // Usually verified end means shift done. User keeps 'cashRemaining'.
                transaction.update(userRef, { cashInHand: cashRemaining });

                // 4. Daily Sales (Granular)
                const today = new Date().toISOString().split('T')[0];
                for (const nozzle of updatedNozzles) {
                    const salesRef = doc(collection(db, "daily_sales"));
                    const price = pricesMap[nozzle.fuelType] || 0;
                    const amount = nozzle.netLitres * price;

                    transaction.set(salesRef, {
                        date: today,
                        attendantId: selectedShift.attendantId,
                        attendantEmail: selectedShift.attendantName,
                        nozzleId: nozzle.nozzleId,
                        nozzleName: nozzle.nozzleName,
                        fuelType: nozzle.fuelType,
                        startReading: nozzle.startReading,
                        endReading: nozzle.endReading,
                        totalLitres: nozzle.totalLitres,
                        testingLitres: nozzle.testingLitres,
                        netLitres: nozzle.netLitres,
                        price: price,
                        amount: amount,
                        timestamp: serverTimestamp()
                    });
                }

                // 6. WRITE: Tank Stock
                for (const tank of tanks) {
                    const litreSum = updatedNozzles
                        .filter(n => n.fuelType === tank.fuelType)
                        .reduce((sum, n) => sum + n.totalLitres, 0);

                    if (litreSum > 0 && tankMap[tank.fuelType]) {
                        const { ref, data } = tankMap[tank.fuelType];
                        transaction.update(ref, {
                            currentLevel: (data.currentLevel || 0) - litreSum
                        });
                    }
                }
            });

            setSuccess("Shift END approved successfully!");
            setShowEndModal(false);
        } catch (err) {
            console.error("Error approving end:", err);
            setError(err.message || "Failed to approve end.");
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
            // Prepare updated nozzles from form data
            const shiftNozzles = selectedShift.nozzles || [{
                nozzleId: selectedShift.nozzleId,
                nozzleName: selectedShift.nozzleName,
                fuelType: selectedShift.fuelType,
                startReading: selectedShift.startReading
            }];

            const updatedNozzles = [];
            let totalLitres = 0; // Gross litres from all nozzles
            let totalTestingLitres = 0;
            let totalNetLitres = 0;

            for (const nozzle of shiftNozzles) {
                const readingKey = nozzle.nozzleId || nozzle.id;
                const inputs = editForm.readings[readingKey] || {};

                const endReading = parseFloat(inputs.endReading);
                if (isNaN(endReading)) throw new Error(`Enter end reading for ${nozzle.nozzleName}`);
                if (endReading < nozzle.startReading) throw new Error(`End reading cannot be less than start reading for ${nozzle.nozzleName}`);

                const testing = parseFloat(inputs.testingLitres) || 0;
                const sales = endReading - nozzle.startReading;
                const net = sales - testing;

                totalLitres += sales;
                totalTestingLitres += testing;
                totalNetLitres += net;

                updatedNozzles.push({
                    ...nozzle,
                    endReading,
                    testingLitres: testing,
                    totalLitres: sales,
                    netLitres: net
                });
            }

            // Financials
            const cashReturned = parseFloat(editForm.cashReturned) || 0;
            // cashOnline deprecated
            const paytm = parseFloat(editForm.paytm) || 0;
            const phonePe = parseFloat(editForm.phonePe) || 0;
            const expenses = parseFloat(editForm.expenses) || 0;
            const change = parseFloat(editForm.change) || 0;

            // Fetch Prices
            const pricesSnapshot = await getDocs(collection(db, "prices"));
            const pricesMap = {};
            pricesSnapshot.forEach(doc => { pricesMap[doc.id] = doc.data().rate; }); // Assuming doc.id is fuelType

            let expectedAmount = 0;
            updatedNozzles.forEach(n => {
                const price = pricesMap[n.fuelType] || 0;
                expectedAmount += (n.netLitres * price);
            });

            const totalDeposited = cashReturned + paytm + phonePe + expenses + change;
            const shortage = expectedAmount - totalDeposited;

            // Fetch Tanks
            const neededFuelTypes = [...new Set(updatedNozzles.map(n => n.fuelType))];
            const tanksQuery = query(collection(db, "tanks"), where("fuelType", "in", neededFuelTypes));
            const tanksSnapshot = await getDocs(tanksQuery);
            const tanks = tanksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            await runTransaction(db, async (transaction) => {
                // 1. READ: Get User & Tanks First
                const shiftRef = doc(db, "shift_logs", selectedShift.id);
                const userRef = doc(db, "users", selectedShift.attendantId);

                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists()) throw new Error("User not found");

                const tankMap = {};
                for (const t of tanks) {
                    const tankRef = doc(db, "tanks", t.id);
                    const tankDoc = await transaction.get(tankRef);
                    if (tankDoc.exists()) {
                        tankMap[t.fuelType] = { ref: tankRef, data: tankDoc.data() };
                    }
                }

                // 2. WRITE: Update Shift Log
                transaction.update(shiftRef, {
                    status: "Completed",
                    endTime: serverTimestamp(),
                    endVerified: true,
                    verifiedAt: serverTimestamp(),
                    managerEnded: true,
                    totalLitres,
                    netLitres: totalNetLitres,
                    testingLitres: totalTestingLitres,
                    amount: expectedAmount,
                    shortage: shortage,
                    nozzles: updatedNozzles,
                    endReading: updatedNozzles.length === 1 ? updatedNozzles[0].endReading : 0,
                    totalLitres: updatedNozzles.length === 1 ? updatedNozzles[0].totalLitres : 0,
                    cashReturned,
                    paytm, phonePe, expenses,
                    change,
                    cashOnline: (paytm + phonePe),
                    cashRemaining: (selectedShift.cashToHandle || 0) - shortage
                });

                // 3. WRITE: Update Nozzles
                for (const nozzle of updatedNozzles) {
                    const nozzleRef = doc(db, "nozzles", nozzle.nozzleId);
                    transaction.update(nozzleRef, { currentMeterReading: nozzle.endReading });
                }

                // 4. WRITE: Update User Cash
                const newCashInHand = (selectedShift.cashToHandle || 0) - shortage;
                transaction.update(userRef, {
                    cashInHand: newCashInHand
                });

                // 5. WRITE: Daily Sales
                const today = new Date().toISOString().split('T')[0];
                for (const nozzle of updatedNozzles) {
                    const salesRef = doc(collection(db, "daily_sales"));
                    const price = pricesMap[nozzle.fuelType] || 0;
                    const amount = nozzle.netLitres * price;
                    transaction.set(salesRef, {
                        date: today,
                        attendantId: selectedShift.attendantId,
                        attendantEmail: selectedShift.attendantName,
                        nozzleId: nozzle.nozzleId,
                        nozzleName: nozzle.nozzleName,
                        fuelType: nozzle.fuelType,
                        startReading: nozzle.startReading,
                        endReading: nozzle.endReading,
                        totalLitres: nozzle.totalLitres,
                        testingLitres: nozzle.testingLitres,
                        netLitres: nozzle.netLitres,
                        price: price,
                        amount: amount,
                        timestamp: serverTimestamp()
                    });
                }

                // 6. WRITE: Tank Stock
                for (const tank of tanks) {
                    const litreSum = updatedNozzles
                        .filter(n => n.fuelType === tank.fuelType)
                        .reduce((sum, n) => sum + n.totalLitres, 0);

                    if (litreSum > 0 && tankMap[tank.fuelType]) {
                        const { ref, data } = tankMap[tank.fuelType];
                        transaction.update(ref, {
                            currentLevel: (data.currentLevel || 0) - litreSum
                        });
                    }
                }
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

    // Handle Manager Start Job (Backdated)
    const handleManagerStartJob = async (e) => {
        e.preventDefault();
        setProcessing(true);
        setError("");

        try {
            if (startJobForm.selectedNozzleIds.length === 0) {
                throw new Error("Please select at least one nozzle");
            }

            const selectedNozzles = nozzles.filter(n => startJobForm.selectedNozzleIds.includes(n.id));
            const cashToHandle = parseFloat(startJobForm.cashToHandle) || 0;

            // Construct Timestamp logic
            const startDateTime = new Date(`${startJobForm.date}T${startJobForm.time}`);
            if (isNaN(startDateTime.getTime())) throw new Error("Invalid date/time");
            const startTimestamp = Timestamp.fromDate(startDateTime);

            await runTransaction(db, async (transaction) => {
                // 1. Get current user data 
                const userRef = doc(db, "users", selectedAttendant.id);
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists()) throw new Error("User not found");

                const currentDbCash = userDoc.data().cashInHand || 0;
                const newCash = currentDbCash + cashToHandle;

                // 2. Create Shift Log
                const shiftRef = doc(collection(db, "shift_logs"));

                // Construct nozzles array for the shift
                const shiftNozzles = selectedNozzles.map(n => {
                    // Use manual start reading if provided, otherwise default to current
                    const manualStart = parseFloat(startJobForm.readings[n.id]);
                    const startReading = !isNaN(manualStart) ? manualStart : n.currentMeterReading;

                    return {
                        nozzleId: n.id,
                        nozzleName: n.nozzleName,
                        fuelType: n.fuelType,
                        startReading: startReading,
                        endReading: startReading, // Init
                        totalLitres: 0,
                        testingLitres: 0
                    };
                });

                const primaryNozzle = shiftNozzles[0];

                transaction.set(shiftRef, {
                    attendantId: selectedAttendant.id,
                    attendantName: selectedAttendant.email,
                    startTime: startTimestamp, // Custom Timestamp

                    // Legacy/Summary fields
                    nozzleId: primaryNozzle.nozzleId,
                    nozzleName: shiftNozzles.map(n => n.nozzleName).join(", "),
                    fuelType: shiftNozzles.length > 1 ? "Mixed" : primaryNozzle.fuelType,
                    startReading: primaryNozzle.startReading,

                    // New Data Structure
                    nozzles: shiftNozzles,

                    cashToHandle: cashToHandle,
                    previousCashInHand: currentDbCash,
                    status: "Active",
                    startVerified: true, // Auto-verified by manager
                    verifiedAt: serverTimestamp() // Verification happened now
                });

                // 3. Update User Cash in Hand
                transaction.update(userRef, { cashInHand: newCash });
            });

            setSuccess("Backdated Job STARTED successfully!");
            setShowManagerStartModal(false);
        } catch (err) {
            console.error("Error starting job:", err);
            setError(err.message || "Failed to start job.");
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
                                        <td className="p-3 text-gray-300">
                                            {shift.nozzles
                                                ? <span className="bg-gray-700 px-2 py-0.5 rounded text-xs">{shift.nozzles.length} Nozzles</span>
                                                : shift.nozzleName}
                                        </td>
                                        <td className="p-3 text-right font-mono text-white">
                                            {shift.nozzles
                                                ? "Various"
                                                : shift.startReading}
                                        </td>
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
                                        <td className="p-3 text-gray-300">
                                            {shift.nozzles
                                                ? <span className="bg-gray-700 px-2 py-0.5 rounded text-xs">{shift.nozzles.length} Nozzles</span>
                                                : shift.nozzleName}
                                        </td>
                                        <td className="p-3 text-right font-mono text-white">
                                            {shift.nozzles
                                                ? shift.nozzles.reduce((acc, n) => acc + (n.endReading || 0), 0).toFixed(2) // Total Not Meaningful really
                                                : shift.endReading}
                                        </td>
                                        <td className="p-3 text-right font-mono text-blue-400">
                                            {shift.totalLitres?.toFixed(2)} L
                                        </td>
                                        <td className="p-3 text-right font-mono text-green-400">₹{shift.cashReturned}</td>
                                        <td className="p-3 text-center">
                                            <button
                                                onClick={() => openEndModal(shift)}
                                                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-bold"
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
                                <div className="text-xs text-gray-600 italic">
                                    <button
                                        onClick={() => openManagerStartModal(attendant)}
                                        className="w-full py-2 bg-green-600/10 text-green-500 hover:bg-green-600 hover:text-white border border-green-600/50 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Play size={14} /> Start Job
                                    </button>
                                </div>
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
                            <div className="space-y-4 max-h-60 overflow-y-auto">
                                {(selectedShift.nozzles || [{ nozzleId: selectedShift.nozzleId, nozzleName: selectedShift.nozzleName }]).map(n => (
                                    <div key={n.nozzleId} className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                        <label className="block text-sm text-gray-300 mb-1">{n.nozzleName} - Start Reading</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            required
                                            value={editForm.readings?.[n.nozzleId]?.startReading || ""}
                                            onChange={e => setEditForm(prev => ({
                                                ...prev,
                                                readings: {
                                                    ...prev.readings,
                                                    [n.nozzleId]: { ...prev.readings[n.nozzleId], startReading: e.target.value }
                                                }
                                            }))}
                                            className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white font-mono"
                                        />
                                    </div>
                                ))}
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Cash to Handle (₹)</label>
                                <input
                                    type="number"

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
                            <div className="space-y-4 max-h-60 overflow-y-auto mb-4 border-b border-gray-800 pb-4">
                                {(selectedShift.nozzles || [{
                                    nozzleId: selectedShift.nozzleId,
                                    nozzleName: selectedShift.nozzleName,
                                    startReading: selectedShift.startReading
                                }]).map(n => (
                                    <div key={n.nozzleId} className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                        <h4 className="font-bold text-primary-orange text-sm mb-2">{n.nozzleName}</h4>
                                        <div className="flex gap-4 text-xs text-gray-500 mb-2">
                                            <span>Start: {n.startReading}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">End Reading</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    required
                                                    className="w-full bg-gray-900 border border-gray-700 rounded p-1 text-white text-sm"
                                                    value={editForm.readings?.[n.nozzleId]?.endReading || ""}
                                                    onChange={e => setEditForm(prev => ({
                                                        ...prev,
                                                        readings: {
                                                            ...prev.readings,
                                                            [n.nozzleId]: { ...prev.readings[n.nozzleId], endReading: e.target.value }
                                                        }
                                                    }))}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Testing (L)</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded p-1 text-white text-sm"
                                                    value={editForm.readings?.[n.nozzleId]?.testingLitres || ""}
                                                    onChange={e => setEditForm(prev => ({
                                                        ...prev,
                                                        readings: {
                                                            ...prev.readings,
                                                            [n.nozzleId]: { ...prev.readings[n.nozzleId], testingLitres: e.target.value }
                                                        }
                                                    }))}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Cash Returned</label>
                                    <input
                                        type="number"

                                        value={editForm.cashReturned}
                                        onChange={e => setEditForm({ ...editForm, cashReturned: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Paytm</label>
                                    <input
                                        type="number"
                                        required
                                        value={editForm.paytm}
                                        onChange={e => setEditForm({ ...editForm, paytm: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">PhonePe</label>
                                    <input
                                        type="number"
                                        required
                                        value={editForm.phonePe}
                                        onChange={e => setEditForm({ ...editForm, phonePe: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Expenses</label>
                                    <input
                                        type="number"

                                        value={editForm.expenses}
                                        onChange={e => setEditForm({ ...editForm, expenses: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Change/Coins</label>
                                    <input
                                        type="number"

                                        value={editForm.change}
                                        onChange={e => setEditForm({ ...editForm, change: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                    />
                                </div>
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

                            <div className="space-y-4 max-h-60 overflow-y-auto mb-4 border-b border-gray-800 pb-4">
                                {(selectedShift.nozzles || [{
                                    nozzleId: selectedShift.nozzleId,
                                    nozzleName: selectedShift.nozzleName,
                                    startReading: selectedShift.startReading
                                }]).map(n => (
                                    <div key={n.nozzleId} className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                        <h4 className="font-bold text-primary-orange text-sm mb-2">{n.nozzleName}</h4>
                                        <div className="flex gap-4 text-xs text-gray-500 mb-2">
                                            <span>Start: {n.startReading}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">End Reading</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    required
                                                    className="w-full bg-gray-900 border border-gray-700 rounded p-1 text-white text-sm"
                                                    value={editForm.readings?.[n.nozzleId]?.endReading || ""}
                                                    onChange={e => setEditForm(prev => ({
                                                        ...prev,
                                                        readings: {
                                                            ...prev.readings,
                                                            [n.nozzleId]: { ...prev.readings[n.nozzleId], endReading: e.target.value }
                                                        }
                                                    }))}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Testing (L)</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded p-1 text-white text-sm"
                                                    value={editForm.readings?.[n.nozzleId]?.testingLitres || ""}
                                                    onChange={e => setEditForm(prev => ({
                                                        ...prev,
                                                        readings: {
                                                            ...prev.readings,
                                                            [n.nozzleId]: { ...prev.readings[n.nozzleId], testingLitres: e.target.value }
                                                        }
                                                    }))}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Cash Returned</label>
                                    <input
                                        type="number"

                                        value={editForm.cashReturned}
                                        onChange={e => setEditForm({ ...editForm, cashReturned: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Paytm</label>
                                    <input
                                        type="number"

                                        value={editForm.paytm}
                                        onChange={e => setEditForm({ ...editForm, paytm: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">PhonePe</label>
                                    <input
                                        type="number"

                                        value={editForm.phonePe}
                                        onChange={e => setEditForm({ ...editForm, phonePe: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Expenses</label>
                                    <input
                                        type="number"

                                        value={editForm.expenses}
                                        onChange={e => setEditForm({ ...editForm, expenses: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Change/Float</label>
                                    <input
                                        type="number"

                                        value={editForm.change}
                                        onChange={e => setEditForm({ ...editForm, change: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
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

            {/* Manager Start Modal */}
            {showManagerStartModal && selectedAttendant && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-card-bg rounded-xl w-full max-w-md border border-gray-800 shadow-2xl">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Start Job for {selectedAttendant.email?.split('@')[0]}</h3>
                            <button onClick={() => setShowManagerStartModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleManagerStartJob} className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm"
                                        value={startJobForm.date}
                                        onChange={e => setStartJobForm({ ...startJobForm, date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Time</label>
                                    <input
                                        type="time"

                                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm"
                                        value={startJobForm.time}
                                        onChange={e => setStartJobForm({ ...startJobForm, time: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Select Nozzles</label>
                                <div className="max-h-40 overflow-y-auto space-y-2 border border-gray-700 rounded p-2">
                                    {nozzles.map(n => (
                                        <label key={n.id} className="flex items-center gap-2 text-sm text-gray-300 hover:bg-gray-800 p-1 rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={startJobForm.selectedNozzleIds.includes(n.id)}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        setStartJobForm(prev => ({
                                                            ...prev,
                                                            selectedNozzleIds: [...prev.selectedNozzleIds, n.id],
                                                            readings: { ...prev.readings, [n.id]: n.currentMeterReading }
                                                        }));
                                                    } else {
                                                        setStartJobForm(prev => ({
                                                            ...prev,
                                                            selectedNozzleIds: prev.selectedNozzleIds.filter(id => id !== n.id)
                                                        }));
                                                    }
                                                }}
                                                className="rounded border-gray-600 bg-gray-800 text-primary-orange"
                                            />
                                            <span className="flex-1">{n.nozzleName} ({n.fuelType})</span>
                                            <span className="font-mono text-xs text-gray-500">{n.currentMeterReading}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Start Readings for Selected */}
                            {startJobForm.selectedNozzleIds.length > 0 && (
                                <div className="space-y-2">
                                    <label className="block text-xs text-gray-400">Start Readings</label>
                                    {startJobForm.selectedNozzleIds.map(id => {
                                        const n = nozzles.find(nozzle => nozzle.id === id);
                                        return (
                                            <div key={id} className="flex gap-2 items-center">
                                                <span className="text-xs text-gray-300 w-1/3 truncate">{n?.nozzleName}</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    required
                                                    value={startJobForm.readings[id] || ""}
                                                    onChange={e => setStartJobForm(prev => ({
                                                        ...prev,
                                                        readings: { ...prev.readings, [id]: e.target.value }
                                                    }))}
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded p-1 text-white text-sm font-mono"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Cash to Handle (₹)</label>
                                <input
                                    type="number"

                                    value={startJobForm.cashToHandle}
                                    onChange={e => setStartJobForm({ ...startJobForm, cashToHandle: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                                />
                            </div>

                            <button disabled={processing} className="w-full py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700">
                                {processing ? "Start Job (Backdated)" : "Confirm Start"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
