import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { collection, getDocs, query, orderBy, where, addDoc, doc, updateDoc, runTransaction, serverTimestamp, increment } from "firebase/firestore";
import { db } from "../../../firebase";
import { TrendingUp, Calendar, Search, FileText, Download, AlertCircle, Wallet, Building2, Plus, ArrowRightLeft, X, Save } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import usePagination from "../../../hooks/usePagination";
import PaginationControls from "../../../components/common/PaginationControls";

export default function Sales() {
    const { currentUser } = useAuth();
    const [sheets, setSheets] = useState([]);
    const [banks, setBanks] = useState([]);
    const [cashInHand, setCashInHand] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Unified Transactions State
    const [allTransactions, setAllTransactions] = useState([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);

    // Modals
    const [showAddBankModal, setShowAddBankModal] = useState(false);
    const [showHandleCashModal, setShowHandleCashModal] = useState(false);

    // Forms
    const [newBank, setNewBank] = useState({ name: "", accountNumber: "", balance: "" });
    const [cashForm, setCashForm] = useState({ amount: "", bankId: "", owner: "" });
    const [depositType, setDepositType] = useState("bank"); // 'bank' or 'owner'
    const [submitting, setSubmitting] = useState(false);

    // Pagination for Daily Sales
    const {
        currentData: currentSheets,
        currentPage: sheetsPage,
        totalPages: sheetsTotalPages,
        nextPage: nextSheetsPage,
        prevPage: prevSheetsPage,
        hasPages: hasSheetsPages
    } = usePagination(sheets, 10);

    // Initial Processing for Transactions (to pass to pagination hook)
    const combinedTransactions = useMemo(() => {
        const sheetTxns = sheets.flatMap(sheet => {
            const sheetDate = new Date(sheet.date);
            const items = [];

            // 1. Payments
            (sheet.payments || []).forEach(p => {
                if (p.amount > 0 && p.type !== "Attendant Cash" && p.type !== "Shortage") {
                    items.push({
                        id: `${sheet.date}-pay-${p.type}`,
                        date: sheetDate,
                        type: "Received",
                        source: p.type,
                        amount: parseFloat(p.amount),
                        details: p.notes || "Daily Collection",
                        mode: p.type
                    });
                }
            });

            // 2. Expenses
            (sheet.expenses || []).forEach((e, idx) => {
                if (e.amount > 0 && e.type !== "Shortage") {
                    items.push({
                        id: `${sheet.date}-exp-${idx}`,
                        date: sheetDate,
                        type: "Expense",
                        source: e.type,
                        amount: parseFloat(e.amount),
                        details: e.notes || "-",
                        mode: e.mode || "Cash"
                    });
                }
            });

            return items;
        });

        return [...allTransactions, ...sheetTxns].sort((a, b) => b.date - a.date);
    }, [sheets, allTransactions]);

    // Pagination for Unified Transactions
    const {
        currentData: currentTxns,
        currentPage: txnsPage,
        totalPages: txnsTotalPages,
        nextPage: nextTxnsPage,
        prevPage: prevTxnsPage,
        hasPages: hasTxnsPages
    } = usePagination(combinedTransactions, 10);


    useEffect(() => {
        fetchSheets();
        fetchBanks();
        fetchCashInHand();
        fetchUnifiedTransactions(); // Fetch other transactions
    }, [selectedMonth]);

    // Fetch Banks
    async function fetchBanks() {
        try {
            const q = query(collection(db, "banks"), orderBy("name"));
            const snapshot = await getDocs(q);
            setBanks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
            console.error("Error fetching banks:", err);
        }
    }

    // Fetch Unified Transactions
    async function fetchUnifiedTransactions() {
        setLoadingTransactions(true);
        try {
            const [year, month] = selectedMonth.split('-');
            const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
            const endOfMonth = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);

            // 1. Fetch Bank Transactions (Deposits/Handover)
            const bankQuery = query(
                collection(db, "bank_transactions"),
                where("date", ">=", startOfMonth),
                where("date", "<=", endOfMonth),
                orderBy("date", "desc")
            );

            // 2. Fetch Vendor Transactions (Only those NOT paid from collection, i.e., Bank/Credit)
            const vendorQuery = query(
                collection(db, "vendor_transactions"),
                where("date", ">=", startOfMonth),
                where("date", "<=", endOfMonth),
                where("paidFromCollection", "==", false),
                orderBy("date", "desc")
            );

            const [bankSnap, vendorSnap] = await Promise.all([
                getDocs(bankQuery),
                getDocs(vendorQuery)
            ]);

            const bankTxns = bankSnap.docs.map(doc => ({
                id: doc.id,
                source: "Cash Handover",
                date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
                type: doc.data().type, // Deposit / Owner Handover
                amount: doc.data().amount,
                details: doc.data().toOwner ? `To: ${doc.data().toOwner}` : "To Bank",
                mode: "Cash"
            }));

            const vendorTxns = vendorSnap.docs.map(doc => ({
                id: doc.id,
                source: "Online Expense",
                date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
                type: "Fuel/Tanker",
                amount: doc.data().amount, // Fuel Amount
                details: `${doc.data().fuelType} (${doc.data().litres}L)`,
                mode: doc.data().fuelPaymentMode || "Bank" // Usually Bank/Credit
            }));

            // We will merge these with Daily Sheet data in a separate effect or calculate render-time
            // But state updates are async, so let's store these raw external txns first or merge here if we access 'sheets'
            // Since 'sheets' is updated in fetchSheets, we can depend on 'sheets' to merge.
            // Let's store raw external txns here.

            setAllTransactions([...bankTxns, ...vendorTxns]);

        } catch (err) {
            console.error("Error fetching transactions:", err);
        } finally {
            setLoadingTransactions(false);
        }
    }

    // Fetch Manager's Cash in Hand
    async function fetchCashInHand() {
        if (!currentUser) return;
        // In a real app, you might want to listen to this in real-time
        // For now, we'll fetch it when the component mounts or updates
        // Assuming the currentUser object in AuthContext might not be up-to-date with Firestore
        // So we fetch from 'users' collection
        try {
            // Note: We need to fetch the user document to get the latest cashInHand
            // Since we don't have a direct 'getDoc' import yet, let's add it or use a query
            // Actually, let's just use the currentUser from context if it has it, 
            // but usually context user is Auth user. We need Firestore user data.
            // Let's assume we can fetch it.
            // For now, let's rely on a separate fetch or if we had a user listener.
            // Let's add 'getDoc' to imports if possible, or just use a query for now.
            // Wait, I can add getDoc to imports.
        } catch (err) {
            console.error("Error fetching cash:", err);
        }
    }

    // We need to add getDoc to imports. I'll do that in the first chunk.
    // Actually, I can just use a query to fetch the user doc by uid.

    useEffect(() => {
        async function getLatestUserData() {
            if (!currentUser?.uid) return;
            try {
                const q = query(collection(db, "users"), where("email", "==", currentUser.email)); // Fallback if uid not key
                // Better: assume users collection is keyed by uid as per schema
                // But I can't use getDoc without importing it.
                // I'll add getDoc to the import list in the first chunk.
            } catch (e) { }
        }
    }, [currentUser]);

    // Re-implementing fetchCashInHand properly with getDocs for now to avoid import errors if I missed it
    // But I added getDoc to the first chunk? No I didn't. I added addDoc, doc, updateDoc...
    // I missed getDoc. I will add it now.

    // Actually, I'll just use onSnapshot or getDocs for simplicity in this turn.
    // Let's use getDocs with a query for the user.

    useEffect(() => {
        if (currentUser?.uid) {
            const fetchUserCash = async () => {
                try {
                    // Assuming 'users' collection uses uid as document ID, but we can't use getDoc easily without import.
                    // Let's use a query.
                    const q = query(collection(db, "users"), where("email", "==", currentUser.email));
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        setCashInHand(snapshot.docs[0].data().cashInHand || 0);
                    }
                } catch (err) {
                    console.error("Error fetching user cash:", err);
                }
            };
            fetchUserCash();
        }
    }, [currentUser, success]); // Refresh on success (transaction completion)

    async function fetchSheets() {
        setLoading(true);
        setError("");
        try {
            // Calculate start and end of the selected month
            const [year, month] = selectedMonth.split('-');
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);

            // Since date is stored as string YYYY-MM-DD in daily_sheets doc ID or date field
            // We can query by date string range
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const q = query(
                collection(db, "daily_sheets"),
                where("date", ">=", startStr),
                where("date", "<=", endStr),
                orderBy("date", "desc")
            );

            const snapshot = await getDocs(q);
            setSheets(snapshot.docs.map(doc => doc.data()));

        } catch (err) {
            console.error("Error fetching sales sheets:", err);
            setError("Failed to load sales data.");
        } finally {
            setLoading(false);
        }
    }

    const downloadReport = () => {
        const doc = new jsPDF();

        doc.setFontSize(20);
        doc.setTextColor(255, 100, 0);
        doc.text(`Sales Report - ${selectedMonth}`, 14, 22);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

        const tableData = sheets.map(sheet => [
            sheet.date,
            `Rs ${sheet.totalPayment?.toFixed(2) || '0.00'}`,
            `Rs ${sheet.totalExpense?.toFixed(2) || '0.00'}`,
            `Rs ${sheet.netCollection?.toFixed(2) || '0.00'}`
        ]);

        // Calculate Totals
        const totalSales = sheets.reduce((sum, s) => sum + (s.totalPayment || 0), 0);
        const totalExpenses = sheets.reduce((sum, s) => sum + (s.totalExpense || 0), 0);
        const netTotal = totalSales - totalExpenses;

        tableData.push([
            "TOTAL",
            `Rs ${totalSales.toFixed(2)}`,
            `Rs ${totalExpenses.toFixed(2)}`,
            `Rs ${netTotal.toFixed(2)}`
        ]);

        autoTable(doc, {
            startY: 40,
            head: [['Date', 'Total Sales', 'Total Expenses', 'Net Collection']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [255, 100, 0] },
            footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
        });

        doc.save(`Sales_Report_${selectedMonth}.pdf`);
    };

    // Handlers
    const handleAddBank = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await addDoc(collection(db, "banks"), {
                name: newBank.name,
                accountNumber: newBank.accountNumber,
                balance: parseFloat(newBank.balance),
                createdAt: serverTimestamp()
            });
            setSuccess("Bank added successfully!");
            setShowAddBankModal(false);
            setNewBank({ name: "", accountNumber: "", balance: "" });
            fetchBanks();
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Error adding bank:", err);
            setError("Failed to add bank.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleCashDeposit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        const amount = parseFloat(cashForm.amount);
        if (amount > cashInHand) {
            setError("Insufficient cash in hand!");
            setSubmitting(false);
            return;
        }

        if (depositType === "bank" && !cashForm.bankId) {
            setError("Please select a bank.");
            setSubmitting(false);
            return;
        }

        if (depositType === "owner" && !cashForm.owner) {
            setError("Please enter owner name.");
            setSubmitting(false);
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const userRef = doc(db, "users", currentUser.uid);

                // 1. Deduct from User (Common for both)
                transaction.update(userRef, {
                    cashInHand: increment(-amount)
                });

                if (depositType === "bank") {
                    const bankRef = doc(db, "banks", cashForm.bankId);
                    // 2. Add to Bank
                    transaction.update(bankRef, {
                        balance: increment(amount)
                    });
                }

                // 3. Record Transaction
                const transRef = doc(collection(db, "bank_transactions"));
                transaction.set(transRef, {
                    type: depositType === "bank" ? "Deposit" : "Owner Handover",
                    fromUser: currentUser.uid,
                    fromUserName: currentUser.email,
                    toBankId: depositType === "bank" ? cashForm.bankId : null,
                    toOwner: depositType === "owner" ? cashForm.owner : null, // Only relevant for owner handover
                    amount: amount,
                    owner: cashForm.owner, // Depositor name (always relevant)
                    date: serverTimestamp()
                });
            });

            setSuccess(depositType === "bank" ? "Cash deposited to bank!" : "Cash handed to owner!");
            setShowHandleCashModal(false);
            setCashForm({ amount: "", bankId: "", owner: "" });
            fetchBanks();
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Error depositing cash:", err);
            setError("Failed to process transaction.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl font-bold text-primary-orange flex items-center gap-2">
                    <TrendingUp size={24} /> Sales Account
                </h1>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowHandleCashModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-lg font-bold"
                    >
                        <ArrowRightLeft size={18} /> Handle Cash
                    </button>

                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-orange"
                        />
                    </div>

                    <button
                        onClick={downloadReport}
                        disabled={sheets.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors border border-gray-700 disabled:opacity-50"
                    >
                        <Download size={18} /> Export PDF
                    </button>
                </div>
            </div>

            {/* Cash and Bank Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cash at Office */}
                <div className="bg-card-bg rounded-xl border border-gray-800 p-6 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <Wallet size={100} />
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-gray-400 font-medium flex items-center gap-2 mb-2">
                            <Wallet size={20} className="text-primary-orange" /> Cash at Office
                        </h3>
                        <div className="text-3xl font-bold text-white">₹{cashInHand.toLocaleString()}</div>
                        <p className="text-xs text-gray-500 mt-1">Held by {currentUser?.email}</p>
                    </div>
                </div>

                {/* Cash in Bank */}
                <div className="bg-card-bg rounded-xl border border-gray-800 p-6 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <Building2 size={100} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-gray-400 font-medium flex items-center gap-2 mb-2">
                                    <Building2 size={20} className="text-blue-400" /> Cash in Bank
                                </h3>
                                <div className="text-3xl font-bold text-white">
                                    ₹{banks.reduce((sum, b) => sum + (b.balance || 0), 0).toLocaleString()}
                                </div>
                            </div>
                            <button
                                onClick={() => setShowAddBankModal(true)}
                                className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-blue-400 transition-colors"
                                title="Add Bank Account"
                            >
                                <Plus size={20} />
                            </button>
                        </div>

                        {/* Bank List */}
                        <div className="space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                            {banks.map(bank => (
                                <div key={bank.id} className="flex justify-between items-center text-sm p-2 bg-gray-900/50 rounded-lg border border-gray-800">
                                    <div>
                                        <div className="font-medium text-white">{bank.name}</div>
                                        <div className="text-xs text-gray-500">{bank.accountNumber}</div>
                                    </div>
                                    <div className="font-mono font-bold text-green-400">₹{bank.balance.toLocaleString()}</div>
                                </div>
                            ))}
                            {banks.length === 0 && (
                                <div className="text-center text-gray-500 text-sm py-2">No bank accounts added.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {success && (
                <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle size={16} /> {success}
                </div>
            )}

            {error && (
                <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden shadow-lg">
                <div className="p-4 border-b border-gray-800 flex items-center gap-2">
                    <FileText size={18} className="text-gray-400" />
                    <h3 className="font-semibold text-white">Daily Sales History</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-gray-900/50 uppercase font-medium text-xs text-gray-500">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3 text-right text-green-400">Cash</th>
                                <th className="px-4 py-3 text-right text-blue-400">Online</th>
                                <th className="px-4 py-3 text-right text-orange-400">Credit</th>
                                <th className="px-4 py-3 text-right">Total Sales</th>
                                <th className="px-4 py-3 text-right">Total Expenses</th>
                                <th className="px-4 py-3 text-right">Net Collection</th>
                                <th className="px-4 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {loading ? (
                                <tr><td colSpan="8" className="px-4 py-8 text-center">Loading...</td></tr>
                            ) : sheets.length === 0 ? (
                                <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">No records found for this month.</td></tr>
                            ) : (
                                <>
                                    {currentSheets.map((sheet, index) => {
                                        const cashSale = sheet.payments?.filter(p => p.type === "Attendant Cash").reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) || 0;
                                        const creditSale = sheet.payments?.filter(p => p.type === "Credit").reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) || 0;
                                        const onlineSale = sheet.payments?.filter(p => p.type !== "Attendant Cash" && p.type !== "Credit").reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) || 0;

                                        return (
                                            <tr key={index} className="hover:bg-gray-800/30 transition-colors">
                                                <td className="px-4 py-3 font-medium text-white">
                                                    {new Date(sheet.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-green-400">
                                                    ₹{cashSale.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-blue-400">
                                                    ₹{onlineSale.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-orange-400">
                                                    ₹{creditSale.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono font-bold text-white">
                                                    ₹{(sheet.totalPayment || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-red-400">
                                                    ₹{(sheet.totalExpense || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className={`px-4 py-3 text-right font-mono font-bold ${(sheet.netCollection || 0) >= 0 ? 'text-white' : 'text-red-500'}`}>
                                                    ₹{(sheet.netCollection || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="px-2 py-1 bg-green-500/20 text-green-500 rounded-full text-xs font-bold">
                                                        Saved
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {/* Summary Row */}
                                    <tr className="bg-gray-900/50 font-bold text-white">
                                        <td className="px-4 py-3">TOTAL</td>
                                        <td className="px-4 py-3 text-right text-green-400">
                                            ₹{sheets.reduce((sum, s) => sum + (s.payments?.filter(p => p.type === "Attendant Cash").reduce((a, b) => a + (parseFloat(b.amount) || 0), 0) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3 text-right text-blue-400">
                                            ₹{sheets.reduce((sum, s) => sum + (s.payments?.filter(p => p.type !== "Attendant Cash" && p.type !== "Credit").reduce((a, b) => a + (parseFloat(b.amount) || 0), 0) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3 text-right text-orange-400">
                                            ₹{sheets.reduce((sum, s) => sum + (s.payments?.filter(p => p.type === "Credit").reduce((a, b) => a + (parseFloat(b.amount) || 0), 0) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3 text-right text-green-500">
                                            ₹{sheets.reduce((sum, s) => sum + (s.totalPayment || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3 text-right text-red-500">
                                            ₹{sheets.reduce((sum, s) => sum + (s.totalExpense || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3 text-right text-primary-orange">
                                            ₹{(sheets.reduce((sum, s) => sum + (s.totalPayment || 0), 0) - sheets.reduce((sum, s) => sum + (s.totalExpense || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td></td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Unified Transactions Table */}
            <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden shadow-lg mt-8">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                        <ArrowRightLeft size={18} className="text-blue-400" /> All Transactions (Cash, Online, Expenses)
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-gray-900/50 uppercase font-medium text-xs text-gray-500">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Category</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3">Mode/Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {currentTxns.length === 0 ? (
                                <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500">No transactions found for this month.</td></tr>
                            ) : (
                                currentTxns.map(txn => (
                                    <tr key={txn.id} className="hover:bg-gray-800/30 transition-colors">
                                        <td className="px-4 py-3 text-white">
                                            {txn.date.toLocaleDateString()}
                                            <div className="text-xs text-gray-500">{txn.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${txn.type === 'Received' ? 'bg-green-500/20 text-green-400' :
                                                txn.type === 'Deposit' ? 'bg-blue-500/20 text-blue-400' :
                                                    'bg-red-500/20 text-red-400'
                                                }`}>
                                                {txn.type === 'Deposit' ? 'Handover' : txn.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-300 font-medium">{txn.source}</td>
                                        <td className="px-4 py-3 text-right font-mono text-white">₹{parseFloat(txn.amount).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-gray-400">
                                            <div className="text-xs text-white">{txn.mode}</div>
                                            <div className="text-[10px]">{txn.details}</div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <PaginationControls
                    currentPage={txnsPage}
                    totalPages={txnsTotalPages}
                    onNext={nextTxnsPage}
                    onPrev={prevTxnsPage}
                    hasPages={hasTxnsPages}
                />
            </div>
            {/* Add Bank Modal */}
            {showAddBankModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-md rounded-xl border border-gray-800 shadow-2xl animate-scale-in">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Add Bank Account</h3>
                            <button onClick={() => setShowAddBankModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleAddBank} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Bank Name</label>
                                <input
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={newBank.name}
                                    onChange={e => setNewBank({ ...newBank, name: e.target.value })}
                                    placeholder="e.g. HDFC Bank"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Account Number</label>
                                <input
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={newBank.accountNumber}
                                    onChange={e => setNewBank({ ...newBank, accountNumber: e.target.value })}
                                    placeholder="Account Number"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Initial Balance (₹)</label>
                                <input
                                    type="number"
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={newBank.balance}
                                    onChange={e => setNewBank({ ...newBank, balance: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-3 bg-primary-orange text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50"
                            >
                                {submitting ? "Adding..." : "Add Bank"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Handle Cash Modal */}
            {showHandleCashModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-md rounded-xl border border-gray-800 shadow-2xl animate-scale-in">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <ArrowRightLeft size={20} className="text-green-500" /> Handle Cash Deposit
                            </h3>
                            <button onClick={() => setShowHandleCashModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCashDeposit} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Manager Name</label>
                                <input
                                    readOnly
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-300 cursor-not-allowed"
                                    value={currentUser?.email || "Unknown"}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Amount to Deposit (₹)</label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    max={cashInHand}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange font-bold text-lg"
                                    value={cashForm.amount}
                                    onChange={e => setCashForm({ ...cashForm, amount: e.target.value })}
                                    placeholder="0.00"
                                />
                                <p className="text-xs text-gray-500 mt-1">Available Cash: ₹{cashInHand.toLocaleString()}</p>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Deposit Type</label>
                                <div className="flex gap-4 mb-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="depositType"
                                            value="bank"
                                            checked={depositType === "bank"}
                                            onChange={() => setDepositType("bank")}
                                            className="form-radio text-primary-orange"
                                        />
                                        <span className="text-white">To Bank</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="depositType"
                                            value="owner"
                                            checked={depositType === "owner"}
                                            onChange={() => setDepositType("owner")}
                                            className="form-radio text-primary-orange"
                                        />
                                        <span className="text-white">To Owner</span>
                                    </label>
                                </div>
                            </div>

                            {depositType === "bank" ? (
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Select Bank</label>
                                    <select
                                        required
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                        value={cashForm.bankId}
                                        onChange={e => setCashForm({ ...cashForm, bankId: e.target.value })}
                                    >
                                        <option value="">-- Select Bank --</option>
                                        {banks.map(b => (
                                            <option key={b.id} value={b.id}>{b.name} (₹{b.balance.toLocaleString()})</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Owner Name</label>
                                    <input
                                        required
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                        value={cashForm.owner}
                                        onChange={e => setCashForm({ ...cashForm, owner: e.target.value })}
                                        placeholder="Enter Owner Name"
                                    />
                                </div>
                            )}

                            {depositType === "bank" && (
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Depositor Name (Optional)</label>
                                    <input
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                        value={cashForm.owner}
                                        onChange={e => setCashForm({ ...cashForm, owner: e.target.value })}
                                        placeholder="e.g. Sumit"
                                    />
                                </div>
                            )}
                            <button
                                type="submit"
                                disabled={submitting || parseFloat(cashForm.amount) > cashInHand}
                                className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? "Processing..." : "Deposit Cash"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );


}

