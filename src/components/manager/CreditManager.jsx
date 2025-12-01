import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, increment } from "firebase/firestore";
import { User, CreditCard, AlertCircle, CheckCircle, Truck } from "lucide-react";

export default function CreditManager() {
    const [customers, setCustomers] = useState([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState("");
    const [selectedVehicle, setSelectedVehicle] = useState("");
    const [amount, setAmount] = useState("");

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Fetch Customers
    useEffect(() => {
        async function fetchCustomers() {
            try {
                const snapshot = await getDocs(collection(db, "customers"));
                const customerList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (customerList.length === 0) {
                    await seedCustomers();
                    const newSnapshot = await getDocs(collection(db, "customers"));
                    setCustomers(newSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
        fetchCustomers();
    }, []);

    async function seedCustomers() {
        const mockCustomers = [
            {
                name: "Rajesh Transports",
                phone: "9876543210",
                creditLimit: 50000,
                outstandingBalance: 12000,
                vehicles: [
                    { plateNumber: "MH-12-AB-1234", driverName: "Ramesh Kumar", vehicleModel: "Tata Ace", fuelType: "Diesel" },
                    { plateNumber: "MH-12-CD-5678", driverName: "Suresh Patil", vehicleModel: "Ashok Leyland", fuelType: "Diesel" }
                ]
            },
            {
                name: "City Bus Service",
                phone: "9876543211",
                creditLimit: 100000,
                outstandingBalance: 85000,
                vehicles: [
                    { plateNumber: "MH-14-XY-9999", driverName: "Vijay Singh", vehicleModel: "Volvo Bus", fuelType: "Diesel" }
                ]
            }
        ];
        for (const c of mockCustomers) {
            await addDoc(collection(db, "customers"), c);
        }
    }

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
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
            // 1. Add Transaction
            await addDoc(collection(db, "credit_transactions"), {
                customerId: selectedCustomerId,
                customerName: selectedCustomer.name,
                vehicleNumber: selectedVehicle || "N/A",
                amount: parseFloat(amount),
                date: serverTimestamp(),
                status: "Pending"
            });

            // 2. Update Customer Balance
            const customerRef = doc(db, "customers", selectedCustomerId);
            await updateDoc(customerRef, {
                outstandingBalance: increment(parseFloat(amount))
            });

            // 3. Update Local State
            setCustomers(prev => prev.map(c =>
                c.id === selectedCustomerId
                    ? { ...c, outstandingBalance: c.outstandingBalance + parseFloat(amount) }
                    : c
            ));

            setSuccess("Transaction logged successfully!");
            setAmount("");
            setSelectedVehicle("");

            setTimeout(() => setSuccess(""), 3000);

        } catch (err) {
            console.error("Error logging transaction:", err);
            setError("Failed to log transaction.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-800 flex items-center gap-3">
                <CreditCard className="text-primary-orange" size={24} />
                <h3 className="text-xl font-semibold text-white">Credit Manager</h3>
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
                                            return (
                                                <option key={index} value={plate}>{plate}</option>
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
    );
}
