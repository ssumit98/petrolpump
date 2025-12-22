import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs, doc, updateDoc, query, where, serverTimestamp, orderBy, limit } from "firebase/firestore";
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

    const [nozzles, setNozzles] = useState([]);
    const [activeShifts, setActiveShifts] = useState([]);
    const [shiftHistory, setShiftHistory] = useState([]);

    // Fetch Tanks & Nozzles & Shifts
    useEffect(() => {
        async function fetchData() {
            try {
                // 1. Tanks
                const tanksSnapshot = await getDocs(collection(db, "tanks"));
                setTanks(tanksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                // 2. Nozzles
                const nozzlesSnapshot = await getDocs(collection(db, "nozzles"));
                setNozzles(nozzlesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                // 3. Active Shifts
                const activeQuery = query(collection(db, "shift_logs"), where("status", "==", "Active"));
                const activeSnapshot = await getDocs(activeQuery);
                setActiveShifts(activeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                // 4. Recent History (for "Last Worked")
                // Fetch enough to cover all nozzles recently.
                const historyQuery = query(collection(db, "shift_logs"), orderBy("endTime", "desc"), limit(50));
                const historySnapshot = await getDocs(historyQuery);
                setShiftHistory(historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            } catch (err) {
                console.error("Error fetching data:", err);
                setError("Failed to load data.");
            } finally {
                setLoading(false);
            }
        }
        fetchData();
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
            {/* Nozzle Monitoring Section */}
            <div className="bg-card-bg p-4 rounded-xl border border-gray-800 mt-8">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Droplets size={20} className="text-blue-400" /> Nozzle Overview
                </h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-gray-400 border-b border-gray-700">
                                <th className="p-3">Nozzle</th>
                                <th className="p-3">Reading</th>
                                <th className="p-3">Status</th>
                                <th className="p-3">Operator / Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {nozzles.map(nozzle => {
                                // Find if this nozzle is in an active shift
                                const activeShift = activeShifts.find(s => {
                                    if (s.nozzleId === nozzle.id) return true;
                                    if (s.nozzles && s.nozzles.some(n => n.nozzleId === nozzle.id)) return true;
                                    return false;
                                });

                                // Find last history if not active
                                let lastShift = null;
                                if (!activeShift) {
                                    lastShift = shiftHistory.find(s => {
                                        if (s.nozzleId === nozzle.id) return true;
                                        if (s.nozzles && s.nozzles.some(n => n.nozzleId === nozzle.id)) return true;
                                        return false;
                                    });
                                }

                                return (
                                    <tr key={nozzle.id} className="hover:bg-gray-900/50">
                                        <td className="p-3 text-white font-medium">
                                            {nozzle.nozzleName}
                                            <span className="block text-xs text-gray-500">{nozzle.fuelType}</span>
                                        </td>
                                        <td className="p-3 text-mono text-xl font-bold text-primary-orange">
                                            {nozzle.currentMeterReading?.toLocaleString() ?? "0"}
                                        </td>
                                        <td className="p-3">
                                            {activeShift ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-500 border border-green-500/20">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                    Running
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-500 border border-gray-500/20">
                                                    Idle
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-white">
                                            {activeShift ? (
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400 font-bold border border-blue-500/30">
                                                            {activeShift.attendantName?.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="text-sm font-medium">{activeShift.attendantName?.split('@')[0]}</span>
                                                    </div>
                                                    <span className="text-xs text-green-400">
                                                        Started: {activeShift.startTime?.toDate ? activeShift.startTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                                                    </span>
                                                </div>
                                            ) : lastShift ? (
                                                <div className="flex flex-col opacity-75">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <History size={12} className="text-gray-500" />
                                                        <span className="text-sm text-gray-300">{lastShift.attendantName?.split('@')[0]}</span>
                                                    </div>
                                                    <span className="text-xs text-gray-500">
                                                        Ended: {lastShift.endTime?.toDate ? lastShift.endTime.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-600 text-xs italic">No recent history</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {nozzles.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="p-4 text-center text-gray-500">No nozzles found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
