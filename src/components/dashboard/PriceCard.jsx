import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { doc, onSnapshot, updateDoc, setDoc } from "firebase/firestore";
import { Edit2, Save, X } from "lucide-react";

export default function PriceCard({ type, label, icon: Icon, color }) {
    const [price, setPrice] = useState(0);
    const [isEditing, setIsEditing] = useState(false);
    const [newPrice, setNewPrice] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Real-time listener for price updates
        const unsub = onSnapshot(doc(db, "prices", type), (doc) => {
            if (doc.exists()) {
                setPrice(doc.data().rate);
                setNewPrice(doc.data().rate);
            } else {
                // Initialize if not exists
                setDoc(doc.ref, { rate: 0, updatedAt: new Date().toISOString() });
            }
            setLoading(false);
        });

        return () => unsub();
    }, [type]);

    const handleUpdate = async () => {
        try {
            await updateDoc(doc(db, "prices", type), {
                rate: parseFloat(newPrice),
                updatedAt: new Date().toISOString(),
            });
            setIsEditing(false);
        } catch (error) {
            console.error("Error updating price:", error);
        }
    };

    return (
        <div className="bg-card-bg p-6 rounded-xl border border-gray-800 relative overflow-hidden group">
            <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
                <Icon size={64} />
            </div>

            <div className="relative z-10">
                <h3 className="text-gray-400 font-medium mb-1 flex items-center gap-2">
                    <Icon size={18} className={color.replace("text-", "text-")} />
                    {label}
                </h3>

                {loading ? (
                    <div className="h-10 w-24 bg-gray-800 animate-pulse rounded"></div>
                ) : isEditing ? (
                    <div className="flex items-center gap-2 mt-2">
                        <input
                            type="number"
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            className="w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white focus:ring-1 focus:ring-primary-orange outline-none"
                            step="0.01"
                        />
                        <button onClick={handleUpdate} className="p-1 hover:text-green-500 transition-colors">
                            <Save size={18} />
                        </button>
                        <button onClick={() => setIsEditing(false)} className="p-1 hover:text-red-500 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-end gap-2 mt-2">
                        <span className="text-3xl font-bold text-white">₹{price.toFixed(2)}</span>
                        <button
                            onClick={() => setIsEditing(true)}
                            className="mb-1 text-gray-500 hover:text-primary-orange transition-colors"
                        >
                            <Edit2 size={16} />
                        </button>
                    </div>
                )}

                <p className="text-xs text-gray-500 mt-2">Per Litre</p>
            </div>
        </div>
    );
}
