import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs, doc, updateDoc, query, where, serverTimestamp } from "firebase/firestore";
import { Droplets, AlertTriangle, CheckCircle, History, Save } from "lucide-react";

export default function ManagerStock() {
    const [tanks, setTanks] = useState([]);
    const [selectedTankId, setSelectedTankId] = useState("");
    const [loading, setLoading] = useState(true);
    const [calculating, setCalculating] = useState(false);

    // Stock Data
    const [openingStock, setOpeningStock] = useState(0); // This is now "Current Book Stock"
    const [physicalStock, setPhysicalStock] = useState("");

    const [success, setSuccess] = useState("");
    const [error, setError] = useState("");

    // Fetch Tanks
    useEffect(() => {
        async function fetchTanks() {
            try {
                const snapshot = await getDocs(collection(db, "tanks"));
                const tankList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setTanks(tankList);
            } catch (err) {
                console.error("Error fetching tanks:", err);
                setError("Failed to load tanks.");
            } finally {
                setLoading(false);
            }
        }
        fetchTanks();
    }, []);

    // Calculate Book Stock when tank is selected
    useEffect(() => {
        async function calculateStock() {
            if (!selectedTankId) return;

            setCalculating(true);
            setPhysicalStock("");

            try {
                const tank = tanks.find(t => t.id === selectedTankId);
                if (!tank) return;

                setOpeningStock(tank.currentLevel);

                setOpeningStock(tank.currentLevel);
                // No need to calculate sales since update anymore as stock is live updated

            } catch (err) {
                console.error("Error calculating stock:", err);
                setError("Failed to calculate current stock.");
            } finally {
                setCalculating(false);
            }
        }

        calculateStock();
    }, [selectedTankId, tanks]);

    const bookStock = openingStock; // Live stock from DB
    const variation = physicalStock ? (parseFloat(physicalStock) - bookStock).toFixed(2) : 0;
    const isLoss = parseFloat(variation) < -5; // Threshold of 5 Litres

    async function handleUpdate(e) {
        e.preventDefault();
        if (!selectedTankId || !physicalStock) return;

        try {
            const tankRef = doc(db, "tanks", selectedTankId);

            await updateDoc(tankRef, {
                currentLevel: parseFloat(physicalStock),
                updatedAt: serverTimestamp() // Reset the cycle
            });

            setSuccess("Stock updated successfully!");

            // Update local state to reflect "New Opening Stock"
            setTanks(prev => prev.map(t =>
                t.id === selectedTankId
                    ? { ...t, currentLevel: parseFloat(physicalStock), updatedAt: new Date() }
                    : t
            ));

            // Reset form
            setPhysicalStock("");
            // Reset form
            setPhysicalStock("");
            setOpeningStock(parseFloat(physicalStock));

            setTimeout(() => setSuccess(""), 3000);

        } catch (err) {
            console.error("Error updating stock:", err);
            setError("Failed to update stock.");
        }
    }

    if (loading) return <div className="text-white p-4">Loading...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-primary-orange mb-6 flex items-center gap-2">
                <Droplets size={24} /> Stock & Dip Management
            </h1>

            {/* Messages */}
            {error && (
                <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                    <AlertTriangle size={16} /> {error}
                </div>
            )}
            {success && (
                <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                    <CheckCircle size={16} /> {success}
                </div>
            )}

            {/* Tank Selection */}
            <div className="bg-card-bg p-4 rounded-xl border border-gray-800">
                <label className="block text-sm font-medium text-gray-400 mb-2">Select Tank for Dip Entry</label>
                <div className="relative">
                    <Droplets className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                    <select
                        className="w-full pl-10 pr-4 py-4 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange focus:border-transparent text-white appearance-none text-lg"
                        value={selectedTankId}
                        onChange={(e) => setSelectedTankId(e.target.value)}
                    >
                        <option value="">-- Choose Tank --</option>
                        {tanks.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.fuelType} Tank ({t.capacity}L)
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedTankId && (
                <div className="animate-fade-in space-y-6">
                    {/* Calculation Card */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 space-y-4">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-400">Current Book Stock</span>
                            <span className="font-mono text-white">{openingStock.toLocaleString()} L</span>
                        </div>
                    </div>

                    {/* Entry Form */}
                    <form onSubmit={handleUpdate} className="space-y-6">
                        <div className="bg-card-bg p-4 rounded-xl border border-gray-800">
                            <label className="block text-sm font-medium text-primary-orange mb-2">Physical Dip Reading (Litres)</label>
                            <input
                                type="number"
                                required
                                step="0.01"
                                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange focus:border-transparent text-white text-2xl font-mono font-bold placeholder-gray-600"
                                placeholder="00000.00"
                                value={physicalStock}
                                onChange={(e) => setPhysicalStock(e.target.value)}
                            />
                        </div>

                        {/* Variation Display */}
                        {physicalStock && (
                            <div className={`p-4 rounded-xl border ${isLoss ? 'bg-red-900/20 border-red-500/50' : 'bg-green-900/20 border-green-500/50'} flex items-center justify-between`}>
                                <div className="flex items-center gap-3">
                                    {isLoss ? <AlertTriangle className="text-red-500" /> : <CheckCircle className="text-green-500" />}
                                    <span className={isLoss ? "text-red-400" : "text-green-400"}>
                                        {isLoss ? "Stock Loss Detected" : "Stock OK"}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className={`block text-2xl font-bold ${isLoss ? "text-red-500" : "text-green-500"}`}>
                                        {variation > 0 ? "+" : ""}{variation} L
                                    </span>
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={!physicalStock}
                            className="w-full py-4 px-6 bg-primary-orange text-white font-bold text-lg rounded-xl shadow-lg hover:bg-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-500/30 transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <History size={20} />
                            UPDATE STOCK
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
