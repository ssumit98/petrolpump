import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc, updateDoc, setDoc, serverTimestamp, runTransaction, increment } from "firebase/firestore";
import { Calendar as CalendarIcon, DollarSign, Droplets, TrendingUp, Save, FileText, Plus, Trash2, TrendingDown, Edit, X, Download } from "lucide-react";
import Calendar from "../../components/common/Calendar";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ManagerOperations() {
    const { currentUser } = useAuth();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [dailyStats, setDailyStats] = useState({
        totalSales: 0,
        totalLitres: 0,
        petrolLitres: 0,
        dieselLitres: 0,
        shiftCount: 0,
        totalPetrolAmount: 0,
        totalDieselAmount: 0,
        nozzleStats: [],
        totalCash: 0,
        totalCredit: 0,
        totalOnline: 0
    });
    const [loading, setLoading] = useState(false);

    // Financials State
    const [payments, setPayments] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [sheetDocId, setSheetDocId] = useState(null);
    const [savingSheet, setSavingSheet] = useState(false);

    // Modal State
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [tempPayments, setTempPayments] = useState([]);
    const [tempExpenses, setTempExpenses] = useState([]);

    // Price Management State
    const [prices, setPrices] = useState({ petrol: 0, diesel: 0 });
    const [newPrices, setNewPrices] = useState({ petrol: "", diesel: "" });
    const [updatingPrices, setUpdatingPrices] = useState(false);
    const [priceMessage, setPriceMessage] = useState("");

    // Fetch Prices
    useEffect(() => {
        async function fetchPrices() {
            try {
                const petrolDoc = await getDoc(doc(db, "prices", "petrol"));
                const dieselDoc = await getDoc(doc(db, "prices", "diesel"));

                const current = {
                    petrol: petrolDoc.exists() ? petrolDoc.data().rate : 0,
                    diesel: dieselDoc.exists() ? dieselDoc.data().rate : 0
                };
                setPrices(current);
                setNewPrices({ petrol: current.petrol, diesel: current.diesel });
            } catch (err) {
                console.error("Error fetching prices:", err);
            }
        }
        fetchPrices();
    }, []);

    // Fetch stats and financials when date changes
    useEffect(() => {
        async function fetchDailyStats() {
            setLoading(true);
            try {
                // Fix: Use local date for dateStr to avoid timezone issues with toISOString()
                const offset = selectedDate.getTimezoneOffset();
                const localDate = new Date(selectedDate.getTime() - (offset * 60 * 1000));
                const dateStr = localDate.toISOString().split('T')[0];

                const startOfDay = new Date(selectedDate);
                startOfDay.setHours(0, 0, 0, 0);

                const endOfDay = new Date(selectedDate);
                endOfDay.setHours(23, 59, 59, 999);

                // 1. Fetch Shifts
                const shiftsQuery = query(
                    collection(db, "shift_logs"),
                    where("startTime", ">=", startOfDay),
                    where("startTime", "<=", endOfDay)
                );

                // 2. Fetch Credit Transactions
                const creditQuery = query(
                    collection(db, "credit_transactions"),
                    where("date", ">=", startOfDay),
                    where("date", "<=", endOfDay),
                    where("status", "==", "Completed")
                );
                const creditSnapshot = await getDocs(creditQuery);
                const creditTotal = creditSnapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);

                // 3. Fetch Vendor Expenses (Paid from Collection)
                const vendorQuery = query(
                    collection(db, "vendor_transactions"),
                    where("date", ">=", startOfDay),
                    where("date", "<=", endOfDay),
                    where("paidFromCollection", "==", true)
                );
                const vendorSnapshot = await getDocs(vendorQuery);
                const vendorExpenses = vendorSnapshot.docs.map(doc => {
                    const data = doc.data();
                    // Check if new schema (has fuelPaymentMode)
                    const isNewSchema = data.fuelPaymentMode !== undefined;

                    if (isNewSchema) {
                        // New Logic: paidFromCollection flag ONLY applies to Tanker Charges
                        // Fuel Amount is handled separately (Bank)
                        return {
                            type: "Tanker Charges",
                            amount: (data.charges || 0),
                            notes: `${data.fuelType} Tanker Charges (${data.litres}L) - ${data.transactionId || ''}`,
                            mode: data.chargesPaymentMode || "Cash"
                        };
                    } else {
                        // Old Logic: Backward compatibility
                        return {
                            type: "Fuel Purchase",
                            amount: (data.amount || 0) + (data.charges || 0),
                            notes: `${data.fuelType} Tanker (${data.litres}L)`,
                            mode: "Cash"
                        };
                    }
                });

                const snapshot = await getDocs(shiftsQuery);
                const shifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Map Credit Transactions to Nozzles based on Shift Timings
                const nozzleCreditMap = {};
                creditSnapshot.docs.forEach(doc => {
                    const credit = doc.data();
                    if (!credit.date) return;
                    const creditTime = credit.date.toDate().getTime();

                    // Find matching shift for this credit transaction
                    const matchShift = shifts.find(s => {
                        const start = s.startTime?.toDate().getTime() || 0;
                        let end = s.endTime?.toDate().getTime();

                        // If shift is still active or missing end time, assume it covers until end of selection day
                        if (!end) {
                            end = endOfDay.getTime();
                        }

                        // Check if transaction was logged by the attendant OF that shift AND during that shift
                        // Adding a small buffer (e.g., 5 mins) to end time for edge cases
                        return s.attendantId === credit.loggedBy && creditTime >= start && creditTime <= (end + 300000);
                    });

                    if (matchShift) {
                        nozzleCreditMap[matchShift.nozzleId] = (nozzleCreditMap[matchShift.nozzleId] || 0) + (credit.amount || 0);
                    }
                });

                // ... (Stats Calculation Logic - Same as before) ...
                let stats = {
                    totalSales: 0,
                    totalLitres: 0,
                    petrolLitres: 0,
                    dieselLitres: 0,
                    shiftCount: shifts.length,
                    totalPetrolAmount: 0,
                    totalDieselAmount: 0,
                    nozzleStats: []
                };

                const nozzleMap = {};
                let autoCash = 0;
                let autoPaytm = 0;
                let autoPhonePe = 0;
                let autoShortage = 0;
                let autoExpenses = 0;

                shifts.forEach(shift => {
                    // Normalize Nozzles: Handle new multi-nozzle structure vs legacy single nozzle
                    const shiftNozzles = shift.nozzles || [{
                        nozzleId: shift.nozzleId,
                        nozzleName: shift.nozzleName,
                        fuelType: shift.fuelType,
                        startReading: shift.startReading,
                        endReading: shift.endReading,
                        totalLitres: shift.totalLitres,
                        testingLitres: shift.testingLitres
                    }];

                    // Financials (Session level) - used for proportional attribution
                    // If legacy, totals are in shift root. If new, derived from nozzles or shift aggregation.
                    const shiftTotalNet = shift.nozzles ? shiftNozzles.reduce((acc, n) => acc + (n.netLitres || ((n.totalLitres || 0) - (n.testingLitres || 0))), 0) : (shift.totalLitres - (shift.testingLitres || 0));


                    shiftNozzles.forEach(n => {
                        const rawLitres = n.totalLitres || (n.endReading - n.startReading);
                        // Ensure we don't get NaN
                        const safeRawLitres = isNaN(rawLitres) ? 0 : rawLitres;
                        const testing = n.testingLitres || 0;
                        const netLitres = n.netLitres !== undefined ? n.netLitres : (safeRawLitres - testing);
                        const safeNetLitres = parseFloat(netLitres) || 0;

                        // Global Stats
                        stats.totalLitres += safeNetLitres;
                        if (n.fuelType === "Petrol") stats.petrolLitres += safeNetLitres;
                        if (n.fuelType === "Diesel") stats.dieselLitres += safeNetLitres;

                        // Aggregate Nozzle Stats
                        if (!nozzleMap[n.nozzleId]) {
                            nozzleMap[n.nozzleId] = {
                                nozzleId: n.nozzleId,
                                nozzleName: n.nozzleName,
                                fuelType: n.fuelType,
                                openingReading: n.startReading,
                                closingReading: n.endReading,
                                totalLitres: 0,
                                online: 0
                            };
                        }

                        // Update Min/Max Readings
                        if (n.startReading < nozzleMap[n.nozzleId].openingReading) {
                            nozzleMap[n.nozzleId].openingReading = n.startReading;
                        }
                        if (n.endReading > nozzleMap[n.nozzleId].closingReading) {
                            nozzleMap[n.nozzleId].closingReading = n.endReading;
                        }

                        nozzleMap[n.nozzleId].totalLitres += safeNetLitres;

                        // Online Attribution:
                        // Attribute 'Online' (Active Shift level) proportionally to nozzle sales volume
                        const ratio = shiftTotalNet > 0 ? (safeNetLitres / shiftTotalNet) : 0;
                        const attributedOnline = (shift.cashOnline || 0) * ratio;

                        nozzleMap[n.nozzleId].online += attributedOnline;
                    });

                    // Auto-calc Financials (Session level)
                    autoCash += (shift.cashReturned || 0);
                    autoPaytm += (shift.paytm || 0);
                    autoPhonePe += (shift.phonePe || 0);
                    autoExpenses += (shift.expenses || 0);

                    if ((shift.cashRemaining || 0) < 0) {
                        autoShortage += Math.abs(shift.cashRemaining);
                    }
                });

                // Convert Map to Array and Calculate Amounts
                stats.nozzleStats = Object.values(nozzleMap).map(n => {
                    const price = n.fuelType === "Petrol" ? prices.petrol : prices.diesel;
                    const amount = n.totalLitres * price;

                    if (n.fuelType === "Petrol") stats.totalPetrolAmount += amount;
                    if (n.fuelType === "Diesel") stats.totalDieselAmount += amount;

                    // Add Credit and Calculate Cash
                    const credit = nozzleCreditMap[n.nozzleId] || 0; // Use the nozzleId from the map key logic

                    // Cash is the balancing figure: Total Amount - Credit - Online
                    // Ensure we don't show negative cash if data is messy
                    const cash = Math.max(0, amount - credit - n.online);

                    return { ...n, amount, credit, cash };
                });

                // Calculate Global Totals for the new columns
                const totalCash = stats.nozzleStats.reduce((sum, n) => sum + n.cash, 0);
                const totalCredit = stats.nozzleStats.reduce((sum, n) => sum + n.credit, 0);
                const totalOnline = stats.nozzleStats.reduce((sum, n) => sum + n.online, 0);
                stats.totalCash = totalCash;
                stats.totalCredit = totalCredit;
                stats.totalOnline = totalOnline;

                setDailyStats(stats);

                // 2. Fetch Daily Sheet Doc
                const sheetDoc = await getDoc(doc(db, "daily_sheets", dateStr));
                if (sheetDoc.exists()) {
                    const data = sheetDoc.data();
                    setPayments(data.payments || []);
                    // Ensure existing expenses have a mode, default to 'Cash' if missing
                    setExpenses((data.expenses || []).map(e => ({ ...e, mode: e.mode || "Cash" })));
                    setSheetDocId(dateStr);
                } else {
                    // Auto-populate if new
                    setPayments([
                        { type: "Attendant Cash", amount: autoCash, notes: "Auto-calculated from shifts" },
                        { type: "Paytm", amount: autoPaytm, notes: "Auto-calculated from shifts" },
                        { type: "PhonePe", amount: autoPhonePe, notes: "Auto-calculated from shifts" },
                        { type: "Credit", amount: creditTotal, notes: "Auto-calculated from transactions" }
                    ]);
                    setExpenses([
                        { type: "Shortage", amount: autoShortage, notes: "Auto-calculated from shifts", mode: "Non-Cash" },
                        { type: "Attendant Expenses", amount: autoExpenses, notes: "Tea/Misc from shifts", mode: "Cash" },
                        ...vendorExpenses
                    ]);
                    setSheetDocId(null);
                }

            } catch (err) {
                console.error("Error fetching daily stats:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchDailyStats();
    }, [selectedDate, prices]);

    const handleSaveSheet = async () => {
        setSavingSheet(true);
        setPriceMessage("");
        try {
            // Fix: Use local date for dateStr
            const offset = selectedDate.getTimezoneOffset();
            const localDate = new Date(selectedDate.getTime() - (offset * 60 * 1000));
            const dateStr = localDate.toISOString().split('T')[0];

            const totalPayment = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
            const totalExpense = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

            // Calculate Cash Component specifically
            // Assuming "Attendant Cash" is the only cash inflow in payments
            const cashPayment = payments.find(p => p.type === "Attendant Cash")?.amount || 0;

            // Exclude "Shortage" from cash expenses as it's a loss, not a cash outflow from the collected amount
            // The "Attendant Cash" is already net of shortage (it's what was actually handed over)
            // Only deduct expenses that were paid in CASH
            const cashExpense = expenses
                .filter(e => (e.mode === "Cash" || !e.mode) && e.type !== "Shortage")
                .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

            const currentNetCash = parseFloat(cashPayment) - parseFloat(cashExpense);

            const sheetData = {
                date: dateStr,
                payments,
                expenses,
                totalPayment,
                totalExpense,
                netCollection: totalPayment - totalExpense,
                petrolLitres: dailyStats.petrolLitres || 0,
                dieselLitres: dailyStats.dieselLitres || 0,
                updatedAt: new Date().toISOString(),
                updatedBy: currentUser.uid
            };

            await runTransaction(db, async (transaction) => {
                const sheetRef = doc(db, "daily_sheets", dateStr);
                const userRef = doc(db, "users", currentUser.uid);

                // Fetch Prices/Tanks to decrement stock
                const tanksSnapshot = await getDocs(collection(db, "tanks")); // Optimally should query, but OK for now
                const tanks = tanksSnapshot.docs.map(t => ({ id: t.id, ...t.data() }));

                // Assuming one tank per fuel type for simplicity, or we decrement the first one found
                const petrolTank = tanks.find(t => t.fuelType === "Petrol");
                const dieselTank = tanks.find(t => t.fuelType === "Diesel");

                const sheetDoc = await transaction.get(sheetRef);
                let previousNetCash = 0;
                let prevPetrolLitres = 0;
                let prevDieselLitres = 0;

                if (sheetDoc.exists()) {
                    const data = sheetDoc.data();
                    // We need to reconstruct what was the cash component of the previous save
                    const prevPayments = data.payments || [];
                    const prevExpenses = data.expenses || [];

                    const prevCashPayment = prevPayments.find(p => p.type === "Attendant Cash")?.amount || 0;

                    // Same logic for previous sheet: exclude Shortage AND check mode
                    const prevCashExpense = prevExpenses
                        .filter(e => e.type !== "Shortage" && (e.mode === "Cash" || !e.mode))
                        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

                    previousNetCash = parseFloat(prevCashPayment) - parseFloat(prevCashExpense);

                    // Previous Litres
                    prevPetrolLitres = data.petrolLitres || 0;
                    prevDieselLitres = data.dieselLitres || 0;
                }

                const diff = currentNetCash - previousNetCash;
                const petrolDiff = (dailyStats.petrolLitres || 0) - prevPetrolLitres;
                const dieselDiff = (dailyStats.dieselLitres || 0) - prevDieselLitres;

                // 1. Save/Update Sheet
                transaction.set(sheetRef, sheetData);

                // 2. Update User Cash
                if (diff !== 0) {
                    transaction.update(userRef, {
                        cashInHand: increment(diff)
                    });
                }

                // 3. Update Fuel Stock (Decrement)
                if (petrolDiff !== 0 && petrolTank) {
                    transaction.update(doc(db, "tanks", petrolTank.id), {
                        currentLevel: increment(-petrolDiff)
                    });
                }
                if (dieselDiff !== 0 && dieselTank) {
                    transaction.update(doc(db, "tanks", dieselTank.id), {
                        currentLevel: increment(-dieselDiff)
                    });
                }
            });

            setSheetDocId(dateStr);
            setPriceMessage("Daily Sheet saved, Cash & Stock updated!");
            setTimeout(() => setPriceMessage(""), 3000);
        } catch (err) {
            console.error("Error saving sheet:", err);
            setPriceMessage("Failed to save sheet.");
        } finally {
            setSavingSheet(false);
        }
    };

    const handlePriceUpdate = async () => {
        setUpdatingPrices(true);
        setPriceMessage("");

        try {
            // 1. Fetch Current Stock
            const tanksSnapshot = await getDocs(collection(db, "tanks"));
            const tanks = tanksSnapshot.docs.map(doc => doc.data());

            const petrolStock = tanks.filter(t => t.fuelType === "Petrol").reduce((sum, t) => sum + (t.currentLevel || 0), 0);
            const dieselStock = tanks.filter(t => t.fuelType === "Diesel").reduce((sum, t) => sum + (t.currentLevel || 0), 0);

            // 2. Calculate Gain/Loss
            const petrolDiff = parseFloat(newPrices.petrol) - prices.petrol;
            const dieselDiff = parseFloat(newPrices.diesel) - prices.diesel;

            const petrolGain = petrolStock * petrolDiff;
            const dieselGain = dieselStock * dieselDiff;
            const totalGain = petrolGain + dieselGain;

            // 3. Update Prices in DB
            await updateDoc(doc(db, "prices", "petrol"), { rate: parseFloat(newPrices.petrol), updatedAt: new Date().toISOString() });
            await updateDoc(doc(db, "prices", "diesel"), { rate: parseFloat(newPrices.diesel), updatedAt: new Date().toISOString() });

            // 4. Generate PDF Report
            const docPdf = new jsPDF();

            // Header
            docPdf.setFontSize(20);
            docPdf.setTextColor(255, 100, 0); // Orange
            docPdf.text("Price Change Impact Report", 14, 22);

            docPdf.setFontSize(10);
            docPdf.setTextColor(100);
            docPdf.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

            // Table Data
            const tableData = [
                ["Fuel Type", "Old Price", "New Price", "Diff", "Current Stock (L)", "Impact (Gain/Loss)"],
                [
                    "Petrol",
                    `Rs ${prices.petrol}`,
                    `Rs ${newPrices.petrol}`,
                    `Rs ${petrolDiff.toFixed(2)}`,
                    petrolStock.toFixed(2),
                    `Rs ${petrolGain.toFixed(2)}`
                ],
                [
                    "Diesel",
                    `Rs ${prices.diesel}`,
                    `Rs ${newPrices.diesel}`,
                    `Rs ${dieselDiff.toFixed(2)}`,
                    dieselStock.toFixed(2),
                    `Rs ${dieselGain.toFixed(2)}`
                ],
                [
                    "TOTAL",
                    "-",
                    "-",
                    "-",
                    (petrolStock + dieselStock).toFixed(2),
                    `Rs ${totalGain.toFixed(2)}`
                ]
            ];

            autoTable(docPdf, {
                startY: 40,
                head: [tableData[0]],
                body: tableData.slice(1),
                theme: 'grid',
                headStyles: { fillColor: [255, 100, 0] },
                footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
            });

            // Summary Text
            const finalY = docPdf.lastAutoTable.finalY + 10;
            docPdf.setFontSize(12);
            docPdf.setTextColor(0);
            if (totalGain >= 0) {
                docPdf.setTextColor(0, 150, 0); // Green
                docPdf.text(`Net Gain: Rs ${totalGain.toFixed(2)}`, 14, finalY);
            } else {
                docPdf.setTextColor(200, 0, 0); // Red
                docPdf.text(`Net Loss: Rs ${Math.abs(totalGain).toFixed(2)}`, 14, finalY);
            }

            docPdf.save(`Price_Change_Report_${new Date().toISOString().split('T')[0]}.pdf`);

            // 5. Update Local State
            setPrices({ petrol: parseFloat(newPrices.petrol), diesel: parseFloat(newPrices.diesel) });
            setPriceMessage("Prices updated & Report downloaded!");
            setTimeout(() => setPriceMessage(""), 5000);

        } catch (err) {
            console.error("Error updating prices:", err);
            setPriceMessage("Failed to update prices.");
        } finally {
            setUpdatingPrices(false);
        }
    };

    const handleDownloadSheetPDF = () => {
        const doc = new jsPDF();
        const dateStr = selectedDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Title
        doc.setFontSize(22);
        doc.setTextColor(255, 100, 0); // Orange
        doc.text("Daily Operations Report", 14, 20);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Date: ${dateStr}`, 14, 28);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 33);

        // 1. Sales Summary
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("1. Fuel Sales Summary", 14, 45);

        const salesHead = [["Nozzle", "Opening", "Closing", "Sale (L)", "Amount (Rs)"]];
        const salesBody = dailyStats.nozzleStats.map(stat => [
            `${stat.nozzleName} (${stat.fuelType})`,
            stat.openingReading,
            stat.closingReading,
            stat.totalLitres.toFixed(2),
            stat.amount.toFixed(2)
        ]);

        // Add Totals Row
        salesBody.push([
            { content: 'TOTAL', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
            dailyStats.totalLitres.toFixed(2),
            (dailyStats.totalPetrolAmount + dailyStats.totalDieselAmount).toFixed(2)
        ]);

        autoTable(doc, {
            startY: 50,
            head: salesHead,
            body: salesBody,
            theme: 'grid',
            headStyles: { fillColor: [60, 60, 60] },
            footStyles: { fillColor: [240, 240, 240] }
        });

        // 2. Financials (Payments)
        let finalY = doc.lastAutoTable.finalY + 15;
        doc.text("2. Payments Received", 14, finalY);

        const payHead = [["Type", "Notes", "Amount (Rs)"]];
        const payBody = payments.map(p => [p.type, p.notes, parseFloat(p.amount || 0).toFixed(2)]);
        const totalPay = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        payBody.push([
            { content: 'Total Received', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
            totalPay.toFixed(2)
        ]);

        autoTable(doc, {
            startY: finalY + 5,
            head: payHead,
            body: payBody,
            theme: 'striped',
            headStyles: { fillColor: [0, 128, 0] } // Green
        });

        // 3. Expenses
        finalY = doc.lastAutoTable.finalY + 15;
        // Check page break
        if (finalY > 250) {
            doc.addPage();
            finalY = 20;
        }

        doc.text("3. Expenses", 14, finalY);

        const expHead = [["Type", "Mode", "Notes", "Amount (Rs)"]];
        const expBody = expenses.map(e => [
            e.type,
            e.mode || 'Cash',
            e.notes,
            parseFloat(e.amount || 0).toFixed(2)
        ]);
        const totalExp = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        expBody.push([
            { content: 'Total Expenses', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
            totalExp.toFixed(2)
        ]);

        autoTable(doc, {
            startY: finalY + 5,
            head: expHead,
            body: expBody,
            theme: 'striped',
            headStyles: { fillColor: [200, 0, 0] } // Red
        });

        // 4. Net Summary
        finalY = doc.lastAutoTable.finalY + 15;
        const netCollection = totalPay - totalExp;

        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Summary", 14, finalY);

        doc.setFontSize(12);
        doc.text(`Total Payments: Rs ${totalPay.toFixed(2)}`, 14, finalY + 10);
        doc.text(`Total Expenses: Rs ${totalExp.toFixed(2)}`, 14, finalY + 16);

        doc.setFontSize(16);
        if (netCollection >= 0) {
            doc.setTextColor(0, 128, 0);
            doc.text(`Net Collection: Rs ${netCollection.toFixed(2)}`, 14, finalY + 26);
        } else {
            doc.setTextColor(200, 0, 0);
            doc.text(`Net Deficit: Rs ${netCollection.toFixed(2)}`, 14, finalY + 26);
        }

        doc.save(`Daily_Report_${selectedDate.toISOString().split('T')[0]}.pdf`);
    };


    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-primary-orange flex items-center gap-2">
                        <CalendarIcon size={24} /> Daily Sheet
                    </h1>
                    <div className="text-gray-400 text-sm">
                        {selectedDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                </div>

                {/* Price Management UI */}
                <div className="bg-card-bg p-4 rounded-xl border border-gray-800 flex flex-col sm:flex-row items-end sm:items-center gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Petrol Price</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                            <input
                                type="number"
                                step="0.01"
                                value={newPrices.petrol}
                                onChange={(e) => setNewPrices({ ...newPrices, petrol: e.target.value })}
                                className="w-24 pl-6 pr-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:ring-1 focus:ring-primary-orange"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Diesel Price</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                            <input
                                type="number"
                                step="0.01"
                                value={newPrices.diesel}
                                onChange={(e) => setNewPrices({ ...newPrices, diesel: e.target.value })}
                                className="w-24 pl-6 pr-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:ring-1 focus:ring-primary-orange"
                            />
                        </div>
                    </div>
                    <button
                        onClick={handlePriceUpdate}
                        disabled={updatingPrices || !newPrices.petrol || !newPrices.diesel}
                        className="px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2 text-sm font-bold h-[34px]"
                    >
                        {updatingPrices ? "..." : <><Save size={16} /> Update</>}
                    </button>
                </div>
            </div>

            {priceMessage && (
                <div className={`px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${priceMessage.includes("Failed") ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}`}>
                    <FileText size={16} /> {priceMessage}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Calendar Section */}
                <div className="md:col-span-1">
                    <div className="bg-card-bg p-4 rounded-xl border border-gray-800 shadow-lg">
                        <Calendar
                            onDateSelect={setSelectedDate}
                        // We could highlight days with sales if we pre-fetched that data
                        />
                    </div>
                </div>

                {/* Stats Section */}
                <div className="md:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Volume Stats Card */}
                        <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-gray-400 text-sm">Total Volume</p>
                                <div className="p-2 bg-blue-600/20 rounded-full text-blue-500">
                                    <Droplets size={20} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Petrol</p>
                                    <h3 className="text-2xl font-bold text-primary-orange font-mono">
                                        {loading ? "..." : dailyStats.petrolLitres.toFixed(2)} <span className="text-sm">L</span>
                                    </h3>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Diesel</p>
                                    <h3 className="text-2xl font-bold text-blue-500 font-mono">
                                        {loading ? "..." : dailyStats.dieselLitres.toFixed(2)} <span className="text-sm">L</span>
                                    </h3>
                                </div>
                            </div>
                        </div>

                        {/* Shifts Card */}
                        <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 flex items-center justify-between">
                            <div>
                                <p className="text-gray-400 text-sm mb-1">Total Shifts</p>
                                <h3 className="text-3xl font-bold text-white font-mono">
                                    {loading ? "..." : dailyStats.shiftCount}
                                </h3>
                            </div>
                            <div className="p-3 bg-green-600/20 rounded-full text-green-500">
                                <TrendingUp size={24} />
                            </div>
                        </div>
                    </div>

                    {/* Detailed Nozzle Table */}
                    <div className="bg-card-bg p-6 rounded-xl border border-gray-800 col-span-1 md:col-span-3">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                            <h3 className="text-lg font-bold text-white">Daily Sales Report</h3>

                            {/* Amount Summary */}
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap gap-4">
                                    <div className="bg-gray-900 px-4 py-2 rounded-lg border border-gray-700">
                                        <span className="text-xs text-gray-400 block">Petrol Amount</span>
                                        <span className="text-lg font-bold text-primary-orange font-mono">₹{dailyStats.totalPetrolAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="bg-gray-900 px-4 py-2 rounded-lg border border-gray-700">
                                        <span className="text-xs text-gray-400 block">Diesel Amount</span>
                                        <span className="text-lg font-bold text-blue-500 font-mono">₹{dailyStats.totalDieselAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-600">
                                        <span className="text-xs text-gray-400 block">Grand Total</span>
                                        <span className="text-xl font-bold text-green-400 font-mono">₹{(dailyStats.totalPetrolAmount + dailyStats.totalDieselAmount).toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-4">
                                    <div className="bg-gray-900/50 px-4 py-2 rounded-lg border border-gray-700 border-l-4 border-l-green-500">
                                        <span className="text-xs text-gray-400 block">Cash (Est.)</span>
                                        <span className="text-lg font-bold text-green-400 font-mono">₹{dailyStats.totalCash?.toFixed(2) || '0.00'}</span>
                                    </div>
                                    <div className="bg-gray-900/50 px-4 py-2 rounded-lg border border-gray-700 border-l-4 border-l-blue-500">
                                        <span className="text-xs text-gray-400 block">Online</span>
                                        <span className="text-lg font-bold text-blue-400 font-mono">₹{dailyStats.totalOnline?.toFixed(2) || '0.00'}</span>
                                    </div>
                                    <div className="bg-gray-900/50 px-4 py-2 rounded-lg border border-gray-700 border-l-4 border-l-orange-500">
                                        <span className="text-xs text-gray-400 block">Credit</span>
                                        <span className="text-lg font-bold text-orange-400 font-mono">₹{dailyStats.totalCredit?.toFixed(2) || '0.00'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-700 text-gray-400 text-sm">
                                        <th className="py-3 px-4">Nozzle Name</th>
                                        <th className="py-3 px-4 text-right">Opening Reading</th>
                                        <th className="py-3 px-4 text-right">Closing Reading</th>
                                        <th className="py-3 px-4 text-right">Sale (L)</th>
                                        <th className="py-3 px-4 text-right text-green-400">Cash (₹)</th>
                                        <th className="py-3 px-4 text-right text-blue-400">Online (₹)</th>
                                        <th className="py-3 px-4 text-right text-orange-400">Credit (₹)</th>
                                        <th className="py-3 px-4 text-right">Total (₹)</th>
                                    </tr>
                                </thead>
                                <tbody className="text-white text-sm">
                                    {dailyStats.nozzleStats.length === 0 ? (
                                        <tr>
                                            <td colSpan="8" className="py-8 text-center text-gray-500">No sales data for this date.</td>
                                        </tr>
                                    ) : (
                                        dailyStats.nozzleStats.map((stat, index) => (
                                            <tr key={index} className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
                                                <td className="py-3 px-4 font-medium">
                                                    {stat.nozzleName}
                                                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${stat.fuelType === 'Petrol' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                                        {stat.fuelType}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right font-mono text-gray-300">{stat.openingReading}</td>
                                                <td className="py-3 px-4 text-right font-mono text-gray-300">{stat.closingReading}</td>
                                                <td className="py-3 px-4 text-right font-mono font-bold">{stat.totalLitres.toFixed(2)}</td>
                                                <td className="py-3 px-4 text-right font-mono text-green-400">₹{stat.cash.toFixed(2)}</td>
                                                <td className="py-3 px-4 text-right font-mono text-blue-400">₹{stat.online.toFixed(2)}</td>
                                                <td className="py-3 px-4 text-right font-mono text-orange-400">₹{stat.credit.toFixed(2)}</td>
                                                <td className="py-3 px-4 text-right font-mono font-bold text-white">₹{stat.amount.toFixed(2)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Financials Section (Payments & Expenses) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Payments Table (Read Only) */}
                        <div className="bg-card-bg p-6 rounded-xl border border-gray-800">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <DollarSign size={20} className="text-green-500" /> Payments Received
                                </h3>
                                <button
                                    onClick={() => {
                                        setTempPayments(JSON.parse(JSON.stringify(payments)));
                                        setShowPaymentModal(true);
                                    }}
                                    className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded text-white flex items-center gap-2 border border-gray-700"
                                >
                                    <Edit size={14} /> Edit Payments
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-700 text-gray-400 text-xs">
                                            <th className="py-2 px-2">Type</th>
                                            <th className="py-2 px-2 text-right">Amount (₹)</th>
                                            <th className="py-2 px-2">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-white text-sm">
                                        {payments.map((row, index) => (
                                            <tr key={index} className="border-b border-gray-800">
                                                <td className="py-2 px-2">{row.type}</td>
                                                <td className="py-2 px-2 text-right font-mono text-green-400">
                                                    {row.amount ? `₹${parseFloat(row.amount).toFixed(2)}` : '-'}
                                                </td>
                                                <td className="py-2 px-2 text-gray-400 text-xs">{row.notes}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-900/50 font-bold">
                                            <td className="py-2 px-2 text-gray-400">Total</td>
                                            <td className="py-2 px-2 text-right text-green-500 font-mono">
                                                ₹{payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0).toFixed(2)}
                                            </td>
                                            <td className="py-2 px-2"></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Expenses Table (Read Only) */}
                        <div className="bg-card-bg p-6 rounded-xl border border-gray-800">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <TrendingDown size={20} className="text-red-500" /> Expenses
                                </h3>
                                <button
                                    onClick={() => {
                                        setTempExpenses(JSON.parse(JSON.stringify(expenses)));
                                        setShowExpenseModal(true);
                                    }}
                                    className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded text-white flex items-center gap-2 border border-gray-700"
                                >
                                    <Edit size={14} /> Edit Expenses
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-700 text-gray-400 text-xs">
                                            <th className="py-2 px-2">Type</th>
                                            <th className="py-2 px-2 text-right">Amount (₹)</th>
                                            <th className="py-2 px-2">Mode</th>
                                            <th className="py-2 px-2">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-white text-sm">
                                        {expenses.map((row, index) => (
                                            <tr key={index} className="border-b border-gray-800">
                                                <td className="py-2 px-2">{row.type}</td>
                                                <td className="py-2 px-2 text-right font-mono text-red-400">
                                                    {row.amount ? `₹${parseFloat(row.amount).toFixed(2)}` : '-'}
                                                </td>
                                                <td className="py-2 px-2 text-gray-400 text-xs">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] ${row.mode === 'Cash' || !row.mode ? 'bg-green-500/20 text-green-400' : row.mode === 'Bank' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
                                                        {row.mode || 'Cash'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-900/50 font-bold">
                                            <td className="py-2 px-2 text-gray-400">Total</td>
                                            <td className="py-2 px-2 text-right text-red-500 font-mono">
                                                ₹{expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0).toFixed(2)}
                                            </td>
                                            <td className="py-2 px-2"></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Net Collection Summary & Save */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-center md:text-left">
                            <p className="text-gray-400 text-sm">Net Collection (Payments - Expenses)</p>
                            <h3 className={`text-3xl font-bold font-mono ${(payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) -
                                expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)) >= 0
                                ? "text-green-500" : "text-red-500"
                                }`}>
                                ₹{(
                                    payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) -
                                    expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
                                ).toFixed(2)}
                            </h3>
                        </div>
                        <button
                            onClick={handleSaveSheet}
                            disabled={savingSheet}
                            className="px-8 py-3 bg-primary-orange text-white rounded-xl hover:bg-orange-600 font-bold shadow-lg flex items-center gap-2 disabled:opacity-50"
                        >
                            {savingSheet ? "Saving..." : <><Save size={20} /> Save Daily Sheet</>}
                        </button>
                        <button
                            onClick={handleDownloadSheetPDF}
                            className="px-6 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-700 font-bold shadow-lg flex items-center gap-2 border border-gray-700"
                        >
                            <Download size={20} /> Download PDF
                        </button>
                    </div>
                </div>
            </div>

            {/* Financial Modal Component (Inline) */}
            {(showPaymentModal || showExpenseModal) && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-card-bg rounded-2xl w-full max-w-2xl border border-gray-800 shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                {showPaymentModal ? <DollarSign className="text-green-500" /> : <TrendingDown className="text-red-500" />}
                                {showPaymentModal ? "Edit Payments" : "Edit Expenses"}
                            </h2>
                            <button
                                onClick={() => { setShowPaymentModal(false); setShowExpenseModal(false); }}
                                className="text-gray-400 hover:text-white"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-700 text-gray-400 text-xs">
                                        <th className="py-2 px-2">Type</th>
                                        <th className="py-2 px-2 text-right">Amount (₹)</th>
                                        {!showPaymentModal && <th className="py-2 px-2">Mode</th>}
                                        <th className="py-2 px-2">Notes</th>
                                        <th className="py-2 px-2 w-8"></th>
                                    </tr>
                                </thead>
                                <tbody className="text-white text-sm">
                                    {(showPaymentModal ? tempPayments : tempExpenses).map((row, index) => (
                                        <tr key={index} className="border-b border-gray-800">
                                            <td className="py-2 px-2">
                                                <input
                                                    type="text"
                                                    value={row.type}
                                                    onChange={(e) => {
                                                        const newData = showPaymentModal ? [...tempPayments] : [...tempExpenses];
                                                        newData[index].type = e.target.value;
                                                        showPaymentModal ? setTempPayments(newData) : setTempExpenses(newData);
                                                    }}
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white focus:ring-1 focus:ring-primary-orange"
                                                    placeholder="Type"
                                                />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    type="number"
                                                    value={row.amount}
                                                    onChange={(e) => {
                                                        const newData = showPaymentModal ? [...tempPayments] : [...tempExpenses];
                                                        newData[index].amount = e.target.value;
                                                        showPaymentModal ? setTempPayments(newData) : setTempExpenses(newData);
                                                    }}
                                                    className={`w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-right font-mono focus:ring-1 focus:ring-primary-orange ${showPaymentModal ? 'text-green-400' : 'text-red-400'}`}
                                                    placeholder="0.00"
                                                />
                                            </td>

                                            {!showPaymentModal && (
                                                <td className="py-2 px-2">
                                                    <select
                                                        value={row.mode || "Cash"}
                                                        onChange={(e) => {
                                                            const newData = [...tempExpenses];
                                                            newData[index].mode = e.target.value;
                                                            setTempExpenses(newData);
                                                        }}
                                                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:ring-1 focus:ring-primary-orange"
                                                    >
                                                        <option value="Cash">Cash</option>
                                                        <option value="Bank">Bank/Online</option>
                                                        <option value="Non-Cash">Non-Cash</option>
                                                    </select>
                                                </td>
                                            )}

                                            <td className="py-2 px-2">
                                                <input
                                                    type="text"
                                                    value={row.notes}
                                                    onChange={(e) => {
                                                        const newData = showPaymentModal ? [...tempPayments] : [...tempExpenses];
                                                        newData[index].notes = e.target.value;
                                                        showPaymentModal ? setTempPayments(newData) : setTempExpenses(newData);
                                                    }}
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300 text-xs focus:ring-1 focus:ring-primary-orange"
                                                    placeholder="Notes"
                                                />
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                                <button
                                                    onClick={() => {
                                                        const newData = showPaymentModal ? tempPayments.filter((_, i) => i !== index) : tempExpenses.filter((_, i) => i !== index);
                                                        showPaymentModal ? setTempPayments(newData) : setTempExpenses(newData);
                                                    }}
                                                    className="text-gray-500 hover:text-red-500"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <button
                                onClick={() => {
                                    const newData = showPaymentModal ? [...tempPayments] : [...tempExpenses];
                                    newData.push({ type: "", amount: "", notes: "", mode: "Cash" });
                                    showPaymentModal ? setTempPayments(newData) : setTempExpenses(newData);
                                }}
                                className="mt-4 text-sm bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded text-white flex items-center gap-2 w-full justify-center border border-gray-700 border-dashed"
                            >
                                <Plus size={16} /> Add Row
                            </button>
                        </div>

                        <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
                            <button
                                onClick={() => { setShowPaymentModal(false); setShowExpenseModal(false); }}
                                className="px-4 py-2 text-gray-400 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (showPaymentModal) {
                                        setPayments(tempPayments);
                                        setShowPaymentModal(false);
                                    } else {
                                        setExpenses(tempExpenses);
                                        setShowExpenseModal(false);
                                    }
                                }}
                                className="px-6 py-2 bg-primary-orange text-white rounded-lg hover:bg-orange-600 font-bold"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
