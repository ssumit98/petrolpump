import { useState, useEffect, useMemo } from "react";
import { db, firebaseConfig } from "../../firebase";
import { collection, getDocs, addDoc, updateDoc, doc, setDoc, serverTimestamp, increment, query, where, orderBy, limit, getDoc } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { User, CreditCard, AlertCircle, CheckCircle, Truck, Plus, X, Save, FileText, Download, Search, Check, XCircle, ExternalLink } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import usePagination from "../../hooks/usePagination";
import PaginationControls from "../../components/common/PaginationControls";

export default function CreditManager() {
    const [customers, setCustomers] = useState([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState("");
    const [selectedVehicle, setSelectedVehicle] = useState("");
    const [amount, setAmount] = useState("");

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Transactions State
    const [transactions, setTransactions] = useState([]);
    const [transactionSearch, setTransactionSearch] = useState("");

    // Payment Requests State
    const [paymentRequests, setPaymentRequests] = useState([]);

    // Add Customer State
    const [showAddModal, setShowAddModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newCustomer, setNewCustomer] = useState({
        name: "",
        email: "",
        password: "",
        phone: "",
        creditLimit: "",
        driverName: "",
        vehicleModel: "",
        plateNumber: "",
        fuelType: "Diesel"
    });

    // Fetch Customers and Payment Requests
    useEffect(() => {
        fetchCustomers();
        fetchPaymentRequests();
    }, []);

    // Fetch Transactions when Customer Selected
    useEffect(() => {
        if (selectedCustomerId) {
            fetchTransactions(selectedCustomerId);
        } else {
            setTransactions([]);
        }
    }, [selectedCustomerId]);

    async function fetchCustomers() {
        try {
            const snapshot = await getDocs(collection(db, "customers"));
            const customerList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (customerList.length === 0) {
                setCustomers([]);
            } else {
                setCustomers(customerList);
            }
        } catch (err) {
            console.error("Error fetching customers:", err);
            setError("Failed to load customers.");
        } finally {
            setLoading(false);
        }
    }

    async function fetchTransactions(customerId) {
        try {
            const q = query(
                collection(db, "credit_transactions"),
                where("customerId", "==", customerId),
                orderBy("date", "desc"),
                limit(50) // Limit to last 50 for performance
            );
            const snapshot = await getDocs(q);
            setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
            console.error("Error fetching transactions:", err);
            // Don't block UI, just log error
        }
    }

    async function fetchPaymentRequests() {
        try {
            const q = query(collection(db, "payment_requests"), where("status", "==", "Pending"), orderBy("timestamp", "desc"));
            const snapshot = await getDocs(q);
            setPaymentRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
            console.error("Error fetching payment requests:", err);
        }
    }

    async function handleApprovePayment(request) {
        if (!window.confirm(`Approve payment of ₹${request.amount} from ${request.customerName}?`)) return;
        setSubmitting(true);
        try {
            // 1. Update Request Status
            await updateDoc(doc(db, "payment_requests", request.id), { status: "Approved" });

            // 2. Add Transaction (Credit)
            await addDoc(collection(db, "credit_transactions"), {
                customerId: request.customerId,
                customerName: request.customerName,
                vehicleNumber: "PAYMENT",
                vehicleModel: request.mode,
                fuelType: "N/A",
                amount: -parseFloat(request.amount), // Negative amount reduces balance
                date: serverTimestamp(),
                status: "Completed"
            });

            // 3. Update Customer Balance
            await updateDoc(doc(db, "customers", request.customerId), {
                outstandingBalance: increment(-parseFloat(request.amount))
            });

            // 4. Update Manager Cash if Cash Payment
            if (request.mode === "Cash") {
                await updateDoc(doc(db, "users", currentUser.uid), {
                    cashInHand: increment(parseFloat(request.amount))
                });
            }

            setSuccess("Payment approved successfully!");
            fetchPaymentRequests();
            fetchCustomers(); // Refresh balances
            if (selectedCustomerId === request.customerId) fetchTransactions(selectedCustomerId);

            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Error approving payment:", err);
            setError("Failed to approve payment.");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleRejectPayment(request) {
        if (!window.confirm(`Reject payment request from ${request.customerName}?`)) return;
        setSubmitting(true);
        try {
            await updateDoc(doc(db, "payment_requests", request.id), { status: "Rejected" });
            setSuccess("Payment rejected.");
            fetchPaymentRequests();
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Error rejecting payment:", err);
            setError("Failed to reject payment.");
        } finally {
            setSubmitting(false);
        }
    }

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

    // Filter Transactions Logic (Memoized for Pagination)
    const filteredTransactions = useMemo(() => {
        if (!transactions.length) return [];
        return transactions.filter(t => {
            if (!transactionSearch) return true;
            const search = transactionSearch.toLowerCase();
            const date = t.date?.toDate ? t.date.toDate().toLocaleDateString() : new Date(t.date).toLocaleDateString();
            return date.toLowerCase().includes(search) ||
                t.vehicleNumber.toLowerCase().includes(search) ||
                t.amount.toString().includes(search);
        });
    }, [transactions, transactionSearch]);

    // Pagination
    const {
        currentData: currentTransactions,
        currentPage,
        totalPages,
        nextPage,
        prevPage,
        hasPages
    } = usePagination(filteredTransactions, 10);

    const currentBalance = selectedCustomer ? (selectedCustomer.outstandingBalance || 0) : 0;
    const creditLimit = selectedCustomer ? (selectedCustomer.creditLimit || 0) : 0;
    const newBalance = currentBalance + (parseFloat(amount) || 0);
    const isOverLimit = newBalance > creditLimit;
    const availableCredit = creditLimit - currentBalance;

    async function handleSubmit(e) {
        e.preventDefault();
        if (!selectedCustomerId || !amount || isOverLimit) return;

        setSubmitting(true);
        setError("");
        setSuccess("");

        try {
            // Find vehicle details
            let vehicleDetails = {
                vehicleNumber: selectedVehicle || "N/A",
                vehicleModel: "Unknown",
                fuelType: "Unknown"
            };

            if (selectedCustomer && selectedCustomer.vehicles) {
                const foundVehicle = selectedCustomer.vehicles.find(v => {
                    const plate = typeof v === 'object' ? v.plateNumber : v;
                    return plate === selectedVehicle;
                });

                if (foundVehicle && typeof foundVehicle === 'object') {
                    vehicleDetails = {
                        vehicleNumber: foundVehicle.plateNumber,
                        vehicleModel: foundVehicle.vehicleModel || "Unknown",
                        fuelType: foundVehicle.fuelType || "Unknown"
                    };
                } else if (foundVehicle) {
                    vehicleDetails.vehicleNumber = foundVehicle; // String case
                }
            }

            // 1. Add Transaction
            await addDoc(collection(db, "credit_transactions"), {
                customerId: selectedCustomerId,
                customerName: selectedCustomer.name,
                ...vehicleDetails,
                amount: parseFloat(amount),
                date: serverTimestamp(),
                status: "Completed" // Changed from Pending to Completed
            });

            // 2. Update Customer Balance
            const customerRef = doc(db, "customers", selectedCustomerId);
            await updateDoc(customerRef, {
                outstandingBalance: increment(parseFloat(amount))
            });

            // 3. Update Daily Sheet (if exists)
            const todayStr = new Date().toISOString().split('T')[0];
            const sheetRef = doc(db, "daily_sheets", todayStr);
            const sheetDoc = await getDoc(sheetRef);

            if (sheetDoc.exists()) {
                const sheetData = sheetDoc.data();
                const updatedPayments = sheetData.payments.map(p => {
                    if (p.type === "Credit") {
                        return { ...p, amount: (parseFloat(p.amount) || 0) + parseFloat(amount) };
                    }
                    return p;
                });

                // Recalculate totals
                const totalPayment = updatedPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                const netCollection = totalPayment - (sheetData.totalExpense || 0);

                await updateDoc(sheetRef, {
                    payments: updatedPayments,
                    totalPayment,
                    netCollection,
                    updatedAt: new Date().toISOString()
                });
            }

            // 4. Update Local State
            setCustomers(prev => prev.map(c =>
                c.id === selectedCustomerId
                    ? { ...c, outstandingBalance: c.outstandingBalance + parseFloat(amount) }
                    : c
            ));

            setSuccess("Transaction logged successfully!");
            setAmount("");
            setSelectedVehicle("");
            fetchTransactions(selectedCustomerId); // Refresh transactions

            setTimeout(() => setSuccess(""), 3000);

        } catch (err) {
            console.error("Error logging transaction:", err);
            setError("Failed to log transaction.");
        } finally {
            setSubmitting(false);
        }
    }

    const generatePDF = () => {
        if (!selectedCustomer || transactions.length === 0) return;
        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text("Petrol Pump Management - Credit Statement", 14, 22);
        doc.setFontSize(12);
        doc.text(`Customer: ${selectedCustomer.name}`, 14, 32);
        doc.text(`Phone: ${selectedCustomer.phone}`, 14, 38);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 44);
        doc.text(`Outstanding Balance: Rs. ${currentBalance.toLocaleString()}`, 14, 54);

        const tableColumn = ["Date", "Vehicle", "Amount (Rs)", "Status"];
        const tableRows = [];
        transactions.forEach(t => {
            const date = t.date?.toDate ? t.date.toDate().toLocaleDateString() : new Date(t.date).toLocaleDateString();
            const vehicleInfo = `${t.vehicleNumber}\n${t.vehicleModel || ''} (${t.fuelType || ''})`;
            tableRows.push([date, vehicleInfo, t.amount.toFixed(2), t.status]);
        });

        autoTable(doc, { head: [tableColumn], body: tableRows, startY: 60 });
        doc.save(`Statement_${selectedCustomer.name}_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const handleAddCustomer = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError("");

        let secondaryApp = null;
        try {
            // 1. Initialize secondary app for Auth creation
            secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
            const secondaryAuth = getAuth(secondaryApp);

            // 2. Create User in Auth
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newCustomer.email, newCustomer.password);
            const user = userCredential.user;

            // 3. Create Customer Doc in Firestore
            const customerData = {
                name: newCustomer.name,
                email: newCustomer.email,
                phone: newCustomer.phone,
                creditLimit: parseFloat(newCustomer.creditLimit),
                outstandingBalance: 0,
                role: "CreditCustomer",
                createdAt: serverTimestamp(),
                vehicles: [
                    {
                        driverName: newCustomer.driverName,
                        vehicleModel: newCustomer.vehicleModel,
                        plateNumber: newCustomer.plateNumber,
                        fuelType: newCustomer.fuelType
                    }
                ]
            };

            await setDoc(doc(db, "customers", user.uid), customerData);
            await setDoc(doc(db, "users", user.uid), {
                email: newCustomer.email,
                role: "CreditCustomer",
                name: newCustomer.name
            });

            setSuccess("Customer added successfully!");
            setShowAddModal(false);
            setNewCustomer({
                name: "", email: "", password: "", phone: "", creditLimit: "",
                driverName: "", vehicleModel: "", plateNumber: "", fuelType: "Diesel"
            });
            fetchCustomers();

        } catch (err) {
            console.error("Error adding customer:", err);
            setError(err.message);
        } finally {
            setCreating(false);
            if (secondaryApp) {
                await deleteApp(secondaryApp);
            }
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <CreditCard className="text-primary-orange" size={24} />
                        <h3 className="text-xl font-semibold text-white">Credit Manager</h3>
                    </div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-orange-600 transition-colors shadow-lg text-sm font-bold"
                    >
                        <Plus size={18} /> Add Customer
                    </button>
                </div>

                <div className="p-6">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg mb-6 text-sm flex items-center gap-2">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded-lg mb-6 text-sm flex items-center gap-2">
                            <CheckCircle size={16} />
                            {success}
                        </div>
                    )}

                    {/* Pending Payment Requests */}
                    {paymentRequests.length > 0 && (
                        <div className="mb-8 bg-gray-900/50 border border-yellow-500/30 rounded-lg overflow-hidden animate-fade-in">
                            <div className="p-4 bg-yellow-500/10 border-b border-yellow-500/30 flex items-center gap-2">
                                <AlertCircle className="text-yellow-500" size={20} />
                                <h3 className="font-bold text-yellow-500">Pending Payment Requests ({paymentRequests.length})</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-gray-300">
                                    <thead className="bg-gray-900 uppercase text-xs font-medium text-gray-500">
                                        <tr>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Customer</th>
                                            <th className="px-4 py-3">Amount</th>
                                            <th className="px-4 py-3">Mode / Ref</th>
                                            <th className="px-4 py-3">Receipt</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {paymentRequests.map(req => (
                                            <tr key={req.id} className="hover:bg-gray-800/50">
                                                <td className="px-4 py-3">{req.timestamp?.toDate ? req.timestamp.toDate().toLocaleDateString() : new Date().toLocaleDateString()}</td>
                                                <td className="px-4 py-3 font-medium text-white">{req.customerName}</td>
                                                <td className="px-4 py-3 font-bold text-green-400">₹{req.amount.toLocaleString()}</td>
                                                <td className="px-4 py-3">
                                                    <div className="text-white">{req.mode}</div>
                                                    <div className="text-xs text-gray-500">{req.transactionId}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {req.receiptUrl ? (
                                                        <a href={req.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary-orange hover:underline flex items-center gap-1">
                                                            <ExternalLink size={14} /> View
                                                        </a>
                                                    ) : (
                                                        <span className="text-gray-600 italic">No Receipt</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right flex justify-end gap-2">
                                                    <button
                                                        onClick={() => handleApprovePayment(req)}
                                                        disabled={submitting}
                                                        className="p-1.5 bg-green-500/20 text-green-500 rounded hover:bg-green-500/30 transition-colors"
                                                        title="Approve"
                                                    >
                                                        <Check size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleRejectPayment(req)}
                                                        disabled={submitting}
                                                        className="p-1.5 bg-red-500/20 text-red-500 rounded hover:bg-red-500/30 transition-colors"
                                                        title="Reject"
                                                    >
                                                        <XCircle size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Customer Select */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Select Customer</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                                <select
                                    required
                                    className="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange focus:border-transparent text-white appearance-none"
                                    value={selectedCustomerId}
                                    onChange={(e) => {
                                        setSelectedCustomerId(e.target.value);
                                        setSelectedVehicle("");
                                    }}
                                >
                                    <option value="">-- Choose Customer --</option>
                                    {customers.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {selectedCustomer && (
                            <div className="animate-fade-in space-y-6">
                                {/* Info Cards */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                                        <span className="text-xs text-gray-400 block mb-1">Credit Limit</span>
                                        <span className="text-lg font-bold text-white">₹{creditLimit.toLocaleString()}</span>
                                    </div>
                                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                                        <span className="text-xs text-gray-400 block mb-1">Available Credit</span>
                                        <span className={`text-lg font-bold ${availableCredit < 5000 ? 'text-red-400' : 'text-green-400'}`}>
                                            ₹{availableCredit.toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Vehicle Select */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Select Vehicle (Optional)</label>
                                    <div className="relative">
                                        <Truck className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                                        <select
                                            className="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange focus:border-transparent text-white appearance-none"
                                            value={selectedVehicle}
                                            onChange={(e) => setSelectedVehicle(e.target.value)}
                                        >
                                            <option value="">-- Select Vehicle --</option>
                                            {selectedCustomer.vehicles?.map((v, index) => {
                                                const plate = typeof v === 'object' ? v.plateNumber : v;
                                                const model = typeof v === 'object' ? v.vehicleModel : '';
                                                const fuel = typeof v === 'object' ? v.fuelType : '';
                                                const label = typeof v === 'object' ? `${plate} - ${model} (${fuel})` : plate;
                                                return (
                                                    <option key={index} value={plate}>{label}</option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                </div>

                                {/* Amount Input */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Transaction Amount</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        step="0.01"
                                        className={`w-full px-4 py-3 bg-gray-900 border rounded-lg focus:ring-2 focus:border-transparent text-white text-xl font-mono font-bold placeholder-gray-600 ${isOverLimit ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:ring-primary-orange'
                                            }`}
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                    />
                                    {isOverLimit && (
                                        <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                                            <AlertCircle size={14} />
                                            Exceeds credit limit! Max allowed: ₹{availableCredit.toLocaleString()}
                                        </p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting || isOverLimit || !amount}
                                    className="w-full py-3 px-6 bg-primary-orange text-white font-bold rounded-lg shadow-lg hover:bg-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-500/30 transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submitting ? "Processing..." : "Log Credit Sale"}
                                </button>
                            </div>
                        )}
                    </form>
                </div>
            </div>

            {/* Recent Transactions Table */}
            {selectedCustomer && (
                <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden animate-fade-in">
                    <div className="p-4 border-b border-gray-800 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                        <div className="flex items-center gap-2">
                            <FileText className="text-primary-orange" size={20} />
                            <h3 className="font-semibold text-white">Recent Transactions</h3>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <div className="relative flex-1 sm:flex-none">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search"
                                    className="bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white focus:ring-1 focus:ring-primary-orange w-full sm:w-48"
                                    value={transactionSearch}
                                    onChange={(e) => setTransactionSearch(e.target.value)}
                                />
                            </div>
                            <button onClick={generatePDF} className="flex items-center gap-2 px-3 py-1.5 bg-primary-orange text-white text-sm rounded-lg hover:bg-orange-600 transition-colors shadow-lg shrink-0">
                                <Download size={16} /> Download
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-gray-400 text-sm">
                            <thead className="bg-gray-900/50 uppercase font-medium">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Vehicle</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {currentTransactions.length > 0 ? (
                                    currentTransactions.map((t) => (
                                        <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                            <td className="px-4 py-3">{t.date?.toDate ? t.date.toDate().toLocaleDateString() : new Date(t.date).toLocaleDateString()}</td>
                                            <td className="px-4 py-3">
                                                <div className="font-mono text-white">{t.vehicleNumber}</div>
                                                <div className="text-xs text-gray-500">{t.vehicleModel} ({t.fuelType})</div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-white">₹{t.amount.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="px-2 py-1 rounded-full text-xs bg-yellow-500/20 text-yellow-500">{t.status}</span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">No transactions found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onNext={nextPage}
                        onPrev={prevPage}
                        hasPages={hasPages}
                    />
                </div>
            )}

            {/* Add Customer Modal */}
            {
                showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <div className="bg-card-bg w-full max-w-2xl rounded-xl border border-gray-800 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
                            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <User size={20} className="text-primary-orange" /> Add New Credit Customer
                                </h3>
                                <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                            </div>
                            <form onSubmit={handleAddCustomer} className="p-6 space-y-6">
                                {/* Personal Info */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-800 pb-2">Account Details</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-1">Customer/Company Name</label>
                                            <input
                                                type="text"
                                                required
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                                value={newCustomer.name}
                                                onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-1">Phone Number</label>
                                            <input
                                                type="tel"
                                                required
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                                value={newCustomer.phone}
                                                onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-1">Email (Login ID)</label>
                                            <input
                                                type="email"
                                                required
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                                value={newCustomer.email}
                                                onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-1">Password</label>
                                            <input
                                                type="password"
                                                required
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                                value={newCustomer.password}
                                                onChange={e => setNewCustomer({ ...newCustomer, password: e.target.value })}
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm text-gray-400 mb-1">Credit Limit (₹)</label>
                                            <input
                                                type="number"
                                                required
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange font-mono"
                                                value={newCustomer.creditLimit}
                                                onChange={e => setNewCustomer({ ...newCustomer, creditLimit: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Vehicle Info */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-800 pb-2">Initial Vehicle Details</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-1">Driver Name</label>
                                            <input
                                                type="text"
                                                required
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                                value={newCustomer.driverName}
                                                onChange={e => setNewCustomer({ ...newCustomer, driverName: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-1">Vehicle Model</label>
                                            <input
                                                type="text"
                                                required
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                                value={newCustomer.vehicleModel}
                                                onChange={e => setNewCustomer({ ...newCustomer, vehicleModel: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-1">Plate Number</label>
                                            <input
                                                type="text"
                                                required
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange uppercase"
                                                value={newCustomer.plateNumber}
                                                onChange={e => setNewCustomer({ ...newCustomer, plateNumber: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-1">Fuel Type</label>
                                            <select
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                                value={newCustomer.fuelType}
                                                onChange={e => setNewCustomer({ ...newCustomer, fuelType: e.target.value })}
                                            >
                                                <option value="Diesel">Diesel</option>
                                                <option value="Petrol">Petrol</option>
                                                <option value="CNG">CNG</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="w-full py-3 bg-primary-orange text-white font-bold rounded-lg hover:bg-orange-600 shadow-lg flex items-center justify-center gap-2"
                                >
                                    {creating ? "Creating Account..." : <><Save size={20} /> Create Customer Account</>}
                                </button>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
