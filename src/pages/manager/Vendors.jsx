import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, serverTimestamp, query, orderBy, limit, increment } from "firebase/firestore";
import { Truck, Droplets, Plus, X, Calendar, DollarSign, AlertCircle, Save, CheckCircle } from "lucide-react";
import usePagination from "../../hooks/usePagination";
import PaginationControls from "../../components/common/PaginationControls";

export default function Vendors() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const {
        currentData: currentTransactions,
        currentPage,
        totalPages,
        nextPage,
        prevPage,
        hasPages
    } = usePagination(transactions, 10);

    const [formData, setFormData] = useState({
        fuelType: "Petrol",
        litres: "",
        amount: "",
        charges: "",
        fuelPaymentMode: "Bank",
        chargesPaymentMode: "Cash",
        fuelPaymentDate: new Date().toISOString().split('T')[0],
        transactionId: "",
        paidFromCollection: false
    });

    useEffect(() => {
        fetchTransactions();
    }, []);

    async function fetchTransactions() {
        try {
            const q = query(
                collection(db, "vendor_transactions"),
                orderBy("date", "desc"),
                limit(50)
            );
            const snapshot = await getDocs(q);
            setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
            console.error("Error fetching transactions:", err);
            setError("Failed to load transactions.");
        } finally {
            setLoading(false);
        }
    }

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        setSuccess("");

        try {
            const litres = parseFloat(formData.litres);
            const amount = parseFloat(formData.amount);
            const charges = parseFloat(formData.charges) || 0;

            if (!litres || !amount) {
                throw new Error("Please enter valid litres and amount.");
            }

            // 1. Add Vendor Transaction
            await addDoc(collection(db, "vendor_transactions"), {
                fuelType: formData.fuelType,
                litres: litres,
                amount: amount,
                charges: charges,
                fuelPaymentMode: formData.fuelPaymentMode,
                chargesPaymentMode: formData.chargesPaymentMode,
                fuelPaymentDate: formData.fuelPaymentDate, // specific date for fuel payment
                // overall date is still used for sorting/logging time
                transactionId: formData.transactionId,
                paidFromCollection: formData.paidFromCollection,
                date: serverTimestamp(),
                status: "Completed"
            });

            // 2. Update Tank Stock
            // Find the tank for this fuel type (assuming one tank per fuel type for simplicity, or update all)
            // In a real scenario, we might select a specific tank. For now, we'll query tanks by fuel type.
            const tanksQuery = query(collection(db, "tanks"), orderBy("fuelType")); // Just getting all tanks
            const tanksSnapshot = await getDocs(tanksQuery);

            // Filter for the correct fuel type
            const targetTank = tanksSnapshot.docs.find(doc => doc.data().fuelType === formData.fuelType);

            if (targetTank) {
                await updateDoc(doc(db, "tanks", targetTank.id), {
                    currentLevel: increment(litres),
                    lastRefillDate: serverTimestamp()
                });
            } else {
                console.warn(`No tank found for ${formData.fuelType}`);
                // Proceeding anyway as transaction is logged
            }

            // 3. Optional: Add Expense to Daily Sheet
            if (formData.paidFromCollection) {
                const todayStr = new Date().toISOString().split('T')[0];
                const sheetRef = doc(db, "daily_sheets", todayStr);
                const sheetDoc = await getDoc(sheetRef);

                if (sheetDoc.exists()) {
                    const sheetData = sheetDoc.data();
                    // Logic Change: If paidFromCollection, ONLY add Tanker Charges as expense
                    // Fuel Amount is assumed to be paid via Bank/Credit separately (not from daily cash)
                    const expenseAmount = charges;

                    const newExpense = {
                        type: "Tanker Charges", // Changed from "Fuel Purchase" to be more specific
                        amount: expenseAmount,
                        notes: `${formData.fuelType} Tanker Charges (${litres}L) - ${formData.transactionId || ''}`,
                        mode: formData.chargesPaymentMode || "Cash"
                    };

                    const updatedExpenses = [...(sheetData.expenses || []), newExpense];
                    const totalExpense = updatedExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
                    const netCollection = (sheetData.totalPayment || 0) - totalExpense;

                    await updateDoc(sheetRef, {
                        expenses: updatedExpenses,
                        totalExpense,
                        netCollection,
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            setSuccess("Tanker entry logged successfully!");
            setShowModal(false);
            setFormData({
                fuelType: "Petrol",
                litres: "",
                amount: "",
                charges: "",
                fuelPaymentMode: "Bank",
                chargesPaymentMode: "Cash",
                fuelPaymentDate: new Date().toISOString().split('T')[0],
                transactionId: "",
                paidFromCollection: false
            });
            fetchTransactions();

        } catch (err) {
            console.error("Error logging entry:", err);
            setError(err.message || "Failed to log entry.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl font-bold text-primary-orange flex items-center gap-2">
                    <Truck size={24} /> Vendor Management
                </h1>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-orange-600 transition-colors shadow-lg font-bold"
                >
                    <Plus size={20} /> Log Tanker Entry
                </button>
            </div>

            {success && (
                <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                    <CheckCircle size={16} /> {success}
                </div>
            )}

            {/* Transactions Table */}
            <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden shadow-lg">
                <div className="p-4 border-b border-gray-800 flex items-center gap-2">
                    <Calendar size={18} className="text-gray-400" />
                    <h3 className="font-semibold text-white">Recent Tanker Entries</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-gray-900/50 uppercase font-medium text-xs text-gray-500">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Fuel Type</th>
                                <th className="px-4 py-3 text-right">Litres</th>
                                <th className="px-4 py-3 text-right">Fuel Amt (₹)</th>
                                <th className="px-4 py-3 text-right">Charges (₹)</th>
                                <th className="px-4 py-3">Modes</th>
                                <th className="px-4 py-3 text-center">Paid from Pump?</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {loading ? (
                                <tr><td colSpan="7" className="px-4 py-8 text-center">Loading...</td></tr>
                            ) : transactions.length === 0 ? (
                                <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-500">No entries found.</td></tr>
                            ) : (
                                currentTransactions.map(t => (
                                    <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                        <td className="px-4 py-3">
                                            {t.date?.toDate ? t.date.toDate().toLocaleDateString() : new Date().toLocaleDateString()}
                                            <div className="text-xs text-gray-500">
                                                {t.date?.toDate ? t.date.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${t.fuelType === 'Petrol' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                                {t.fuelType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-white">{t.litres} L</td>
                                        <td className="px-4 py-3 text-right font-mono font-bold text-white">₹{t.amount.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-mono text-gray-400">₹{t.charges.toLocaleString()}</td>
                                        <td className="px-4 py-3">
                                            <div className="text-xs text-white">Fuel: <span className="text-gray-400">{t.fuelPaymentMode || t.paymentMode}</span></div>
                                            <div className="text-xs text-white">Chg: <span className="text-gray-400">{t.chargesPaymentMode || '-'}</span></div>
                                            <div className="text-[10px] text-gray-500 font-mono mt-1">{t.transactionId || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {t.paidFromCollection ? (
                                                <span className="text-green-500 text-xs font-bold">YES</span>
                                            ) : (
                                                <span className="text-gray-600 text-xs">NO</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
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

            {/* Log Entry Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-lg rounded-xl border border-gray-800 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Truck size={24} className="text-primary-orange" /> Log Tanker Entry
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white"><X size={24} /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && (
                                <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                                    <AlertCircle size={16} /> {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Fuel Type</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, fuelType: "Petrol" })}
                                        className={`py-3 rounded-lg border font-bold transition-all ${formData.fuelType === "Petrol"
                                            ? "bg-primary-orange text-white border-primary-orange"
                                            : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-600"
                                            }`}
                                    >
                                        Petrol
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, fuelType: "Diesel" })}
                                        className={`py-3 rounded-lg border font-bold transition-all ${formData.fuelType === "Diesel"
                                            ? "bg-blue-600 text-white border-blue-600"
                                            : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-600"
                                            }`}
                                    >
                                        Diesel
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Fuel Quantity (Litres)</label>
                                    <div className="relative">
                                        <Droplets className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                        <input
                                            type="number"
                                            name="litres"
                                            required
                                            min="1"
                                            step="0.01"
                                            className="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white font-mono text-lg"
                                            placeholder="0.00"
                                            value={formData.litres}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Fuel Amount (₹)</label>
                                        <input
                                            type="number"
                                            name="amount"
                                            required
                                            min="0"
                                            step="0.01"
                                            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white font-mono text-lg"
                                            placeholder="0.00"
                                            value={formData.amount}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Fuel Payment Mode</label>
                                        <select
                                            name="fuelPaymentMode"
                                            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white mb-2"
                                            value={formData.fuelPaymentMode}
                                            onChange={handleInputChange}
                                        >
                                            <option value="Bank">Bank Transfer</option>
                                            <option value="Cheque">Cheque</option>
                                            <option value="Credit">Credit (Pay Later)</option>
                                            <option value="Cash">Cash</option>
                                        </select>

                                        <label className="block text-xs font-medium text-gray-500 mb-1">Payment Date</label>
                                        <input
                                            type="date"
                                            name="fuelPaymentDate"
                                            value={formData.fuelPaymentDate}
                                            onChange={handleInputChange}
                                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Tanker Charges (₹)</label>
                                    <input
                                        type="number"
                                        name="charges"
                                        min="0"
                                        step="0.01"
                                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white"
                                        placeholder="0.00"
                                        value={formData.charges}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Charges Payment Mode</label>
                                    <select
                                        name="chargesPaymentMode"
                                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white"
                                        value={formData.chargesPaymentMode}
                                        onChange={handleInputChange}
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="Online">Online Transfer</option>
                                        <option value="Bank">Bank Account</option>
                                    </select>
                                </div>
                            </div>

                            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="paidFromCollection"
                                    name="paidFromCollection"
                                    checked={formData.paidFromCollection}
                                    onChange={handleInputChange}
                                    className="w-5 h-5 rounded border-gray-600 text-primary-orange focus:ring-primary-orange bg-gray-800"
                                />
                                <label htmlFor="paidFromCollection" className="text-sm text-gray-300 cursor-pointer select-none">
                                    <span className="font-bold block text-white">Charges Paid from Daily Collection?</span>
                                    <span className="text-xs text-gray-500">If checked, ONLY Tanker Charges ({formData.charges || 0}) will be added as expense.</span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Transaction ID / Ref No.</label>
                                <input
                                    type="text"
                                    name="transactionId"
                                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white font-mono"
                                    placeholder="Optional"
                                    value={formData.transactionId}
                                    onChange={handleInputChange}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-4 bg-primary-orange text-white font-bold rounded-xl hover:bg-orange-600 shadow-lg flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                            >
                                {submitting ? "Processing..." : <><Save size={20} /> Save Entry & Update Stock</>}
                            </button>
                        </form>
                    </div>
                </div >
            )
            }
        </div >
    );
}
