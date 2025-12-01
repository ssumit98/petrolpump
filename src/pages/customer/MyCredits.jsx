import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { db, storage } from "../../firebase";
import { collection, query, where, getDocs, orderBy, addDoc, updateDoc, doc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { LogOut, Download, FileText, CreditCard, AlertCircle, Truck, Plus, X, Upload, CheckCircle, Search } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function CustomerCredits() {
    const { logout, currentUser } = useAuth();
    const [customer, setCustomer] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [managers, setManagers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Modals State
    const [showVehicleModal, setShowVehicleModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    // Search State
    const [vehicleSearch, setVehicleSearch] = useState("");
    const [transactionSearch, setTransactionSearch] = useState("");

    // Add Vehicle Form State
    const [vehicleForm, setVehicleForm] = useState({
        plateNumber: "",
        driverName: "",
        vehicleModel: "",
        fuelType: "Diesel"
    });

    // ... (rest of the component)

    const handleAddVehicle = async (e) => {
        e.preventDefault();
        if (!customer) return;

        try {
            const customerRef = doc(db, "customers", customer.id);
            await updateDoc(customerRef, {
                vehicles: arrayUnion(vehicleForm)
            });

            setCustomer(prev => ({
                ...prev,
                vehicles: [...(prev.vehicles || []), vehicleForm]
            }));

            setSuccess("Vehicle added successfully!");
            setShowVehicleModal(false);
            setVehicleForm({ plateNumber: "", driverName: "", vehicleModel: "", fuelType: "Diesel" });
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Error adding vehicle:", err);
            setError("Failed to add vehicle.");
        }
    };

    // Payment Form State
    const [paymentForm, setPaymentForm] = useState({
        managerId: "",
        amount: "",
        mode: "Online",
        transactionId: "",
        receipt: null
    });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        async function fetchData() {
            if (!currentUser?.email) return;

            try {
                // 1. Fetch Customer
                let customerDoc = null;
                const q = query(collection(db, "customers"), where("email", "==", currentUser.email));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    customerDoc = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
                } else {
                    // Fallback for testing
                    const allCustomers = await getDocs(collection(db, "customers"));
                    if (!allCustomers.empty) {
                        customerDoc = { id: allCustomers.docs[0].id, ...allCustomers.docs[0].data() };
                    }
                }

                if (customerDoc) {
                    setCustomer(customerDoc);

                    // 2. Fetch Transactions
                    const transQuery = query(
                        collection(db, "credit_transactions"),
                        where("customerId", "==", customerDoc.id)
                    );
                    const transSnapshot = await getDocs(transQuery);
                    const transList = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    // Sort client-side
                    transList.sort((a, b) => {
                        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                        return dateB - dateA;
                    });

                    setTransactions(transList);
                } else {
                    setError("Customer record not found.");
                }

                // 3. Fetch Managers for Payment
                const managersQuery = query(collection(db, "users"), where("role", "==", "Manager"));
                const managersSnapshot = await getDocs(managersQuery);
                setManagers(managersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            } catch (err) {
                console.error("Error fetching data:", err);
                setError("Failed to load data.");
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [currentUser]);

    const generatePDF = () => {
        if (!customer || transactions.length === 0) return;
        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text("Petrol Pump Management - Credit Statement", 14, 22);
        doc.setFontSize(12);
        doc.text(`Customer: ${customer.name}`, 14, 32);
        doc.text(`Phone: ${customer.phone}`, 14, 38);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 44);
        doc.text(`Outstanding Balance: Rs. ${customer.outstandingBalance.toLocaleString()}`, 14, 54);

        const tableColumn = ["Date", "Vehicle No", "Amount (Rs)", "Status"];
        const tableRows = [];
        transactions.forEach(t => {
            const date = t.date?.toDate ? t.date.toDate().toLocaleDateString() : new Date(t.date).toLocaleDateString();
            tableRows.push([date, t.vehicleNumber, t.amount.toFixed(2), t.status]);
        });

        autoTable(doc, { head: [tableColumn], body: tableRows, startY: 60 });
        doc.save(`Statement_${customer.name}_${new Date().toISOString().split('T')[0]}.pdf`);
    };



    const handlePaymentRequest = async (e) => {
        e.preventDefault();
        if (!customer || !paymentForm.receipt) return;
        setUploading(true);

        try {
            // 1. Upload Receipt
            const fileRef = ref(storage, `receipts/${Date.now()}_${paymentForm.receipt.name}`);
            await uploadBytes(fileRef, paymentForm.receipt);
            const receiptUrl = await getDownloadURL(fileRef);

            // 2. Create Payment Request
            await addDoc(collection(db, "payment_requests"), {
                customerId: customer.id,
                customerName: customer.name,
                managerId: paymentForm.managerId,
                amount: parseFloat(paymentForm.amount),
                mode: paymentForm.mode,
                transactionId: paymentForm.transactionId,
                receiptUrl,
                status: "Pending",
                timestamp: serverTimestamp()
            });

            setSuccess("Payment request submitted for verification!");
            setShowPaymentModal(false);
            setPaymentForm({ managerId: "", amount: "", mode: "Online", transactionId: "", receipt: null });
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Error submitting payment:", err);
            setError("Failed to submit payment request.");
        } finally {
            setUploading(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-dark-bg text-white flex items-center justify-center">Loading...</div>;

    return (
        <div className="min-h-screen bg-dark-bg text-white p-4 pb-20 relative">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-primary-orange">Welcome back, {customer?.name || currentUser?.email}</h1>
                    <p className="text-xs text-gray-400">Customer Portal</p>
                </div>
                <button onClick={logout} className="p-2 bg-red-600/20 text-red-500 rounded-lg hover:bg-red-600/30 transition-colors">
                    <LogOut size={20} />
                </button>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
                    <AlertCircle size={16} /> {error}
                </div>
            )}
            {success && (
                <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
                    <CheckCircle size={16} /> {success}
                </div>
            )}

            <div className="space-y-6">
                {/* Outstanding Dues Card */}
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl border border-gray-700 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <CreditCard size={120} />
                    </div>
                    <div className="relative z-10 flex justify-between items-end">
                        <div>
                            <span className="text-gray-400 text-sm font-medium">Total Outstanding Dues</span>
                            <div className="mt-2 flex items-baseline gap-1">
                                <span className="text-4xl font-bold text-white">₹{customer?.outstandingBalance?.toLocaleString()}</span>
                                <span className="text-sm text-gray-500">INR</span>
                            </div>
                            <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                Credit Limit: ₹{customer?.creditLimit?.toLocaleString()}
                            </div>
                        </div>
                        <button
                            onClick={() => setShowPaymentModal(true)}
                            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg transition-colors flex items-center gap-2"
                        >
                            <CreditCard size={18} /> Pay Now
                        </button>
                    </div>
                </div>



                {/* Authorized Vehicles Table */}
                <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden">
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Truck className="text-primary-orange" size={20} />
                            <h3 className="font-semibold text-white">Authorized Vehicles & Drivers</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search"
                                    className="bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white focus:ring-1 focus:ring-primary-orange w-48"
                                    value={vehicleSearch}
                                    onChange={(e) => setVehicleSearch(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={() => setShowVehicleModal(true)}
                                className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-primary-orange transition-colors"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-gray-400 text-sm">
                            <thead className="bg-gray-900/50 uppercase font-medium sticky top-0 backdrop-blur-sm">
                                <tr>
                                    <th className="px-4 py-3">Driver Name</th>
                                    <th className="px-4 py-3">Vehicle Model</th>
                                    <th className="px-4 py-3">Fuel Type</th>
                                    <th className="px-4 py-3 text-right">Number Plate</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {customer?.vehicles && customer.vehicles.length > 0 ? (
                                    customer.vehicles
                                        .filter(v => {
                                            if (!vehicleSearch) return true;
                                            const search = vehicleSearch.toLowerCase();
                                            const isObject = typeof v === 'object';
                                            const plate = isObject ? v.plateNumber : v;
                                            const driver = isObject ? v.driverName : "";
                                            const model = isObject ? v.vehicleModel : "";
                                            return plate.toLowerCase().includes(search) ||
                                                driver.toLowerCase().includes(search) ||
                                                model.toLowerCase().includes(search);
                                        })
                                        .map((v, index) => {
                                            const isObject = typeof v === 'object';
                                            return (
                                                <tr key={index} className="hover:bg-gray-800/30 transition-colors">
                                                    <td className="px-4 py-3 text-white font-medium">{isObject ? v.driverName : "N/A"}</td>
                                                    <td className="px-4 py-3">{isObject ? v.vehicleModel : "Unknown Model"}</td>
                                                    <td className="px-4 py-3 text-gray-400">{isObject ? (v.fuelType || "N/A") : "N/A"}</td>
                                                    <td className="px-4 py-3 text-right font-mono text-primary-orange">{isObject ? v.plateNumber : v}</td>
                                                </tr>
                                            );
                                        })
                                ) : (
                                    <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">No vehicles linked.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Transaction History */}
                <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden">
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <FileText className="text-primary-orange" size={20} />
                            <h3 className="font-semibold text-white">Recent Transactions</h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search"
                                    className="bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white focus:ring-1 focus:ring-primary-orange w-48"
                                    value={transactionSearch}
                                    onChange={(e) => setTransactionSearch(e.target.value)}
                                />
                            </div>
                            <button onClick={generatePDF} className="flex items-center gap-2 px-3 py-1.5 bg-primary-orange text-white text-sm rounded-lg hover:bg-orange-600 transition-colors shadow-lg">
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
                                {transactions.length > 0 ? (
                                    transactions
                                        .filter(t => {
                                            if (!transactionSearch) return true;
                                            const search = transactionSearch.toLowerCase();
                                            const date = t.date?.toDate ? t.date.toDate().toLocaleDateString() : new Date(t.date).toLocaleDateString();
                                            return date.toLowerCase().includes(search) ||
                                                t.vehicleNumber.toLowerCase().includes(search) ||
                                                t.amount.toString().includes(search);
                                        })
                                        .map((t) => (
                                            <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                                <td className="px-4 py-3">{t.date?.toDate ? t.date.toDate().toLocaleDateString() : new Date(t.date).toLocaleDateString()}</td>
                                                <td className="px-4 py-3 font-mono">{t.vehicleNumber}</td>
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
                </div>
            </div>

            {/* Add Vehicle Modal */}
            {showVehicleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-md rounded-xl border border-gray-800 shadow-2xl animate-scale-in">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Add New Vehicle</h3>
                            <button onClick={() => setShowVehicleModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleAddVehicle} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Number Plate</label>
                                <input
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={vehicleForm.plateNumber}
                                    onChange={e => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })}
                                    placeholder="MH-12-AB-1234"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Driver Name</label>
                                <input
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={vehicleForm.driverName}
                                    onChange={e => setVehicleForm({ ...vehicleForm, driverName: e.target.value })}
                                    placeholder="Driver Name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Vehicle Model</label>
                                <input
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={vehicleForm.vehicleModel}
                                    onChange={e => setVehicleForm({ ...vehicleForm, vehicleModel: e.target.value })}
                                    placeholder="e.g. Tata Ace"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Fuel Type</label>
                                <select
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={vehicleForm.fuelType}
                                    onChange={e => setVehicleForm({ ...vehicleForm, fuelType: e.target.value })}
                                >
                                    <option value="Diesel">Diesel</option>
                                    <option value="Petrol">Petrol</option>
                                    <option value="CNG">CNG</option>
                                </select>
                            </div>
                            <button type="submit" className="w-full py-3 bg-primary-orange text-white font-bold rounded-lg hover:bg-orange-600">Add Vehicle</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-md rounded-xl border border-gray-800 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Make Payment</h3>
                            <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handlePaymentRequest} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Select Manager for Verification</label>
                                <select
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={paymentForm.managerId}
                                    onChange={e => setPaymentForm({ ...paymentForm, managerId: e.target.value })}
                                >
                                    <option value="">-- Select Manager --</option>
                                    {managers.map(m => (
                                        <option key={m.id} value={m.id}>{m.name || m.email}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Amount (INR)</label>
                                <input
                                    type="number"
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={paymentForm.amount}
                                    onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Payment Mode</label>
                                <select
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={paymentForm.mode}
                                    onChange={e => setPaymentForm({ ...paymentForm, mode: e.target.value })}
                                >
                                    <option value="Online">Online (UPI/NetBanking)</option>
                                    <option value="Cash">Cash</option>
                                    <option value="Cheque">Cheque</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Transaction ID / Cheque No.</label>
                                <input
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-orange"
                                    value={paymentForm.transactionId}
                                    onChange={e => setPaymentForm({ ...paymentForm, transactionId: e.target.value })}
                                    placeholder="Transaction Reference"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Upload Receipt/Screenshot</label>
                                <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center hover:border-primary-orange transition-colors cursor-pointer relative">
                                    <input
                                        type="file"
                                        required
                                        accept="image/*,application/pdf"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        onChange={e => setPaymentForm({ ...paymentForm, receipt: e.target.files[0] })}
                                    />
                                    <Upload className="mx-auto text-gray-500 mb-2" />
                                    <p className="text-sm text-gray-400">
                                        {paymentForm.receipt ? paymentForm.receipt.name : "Click to upload receipt"}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={uploading}
                                className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                                {uploading ? "Uploading..." : "Submit for Verification"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
