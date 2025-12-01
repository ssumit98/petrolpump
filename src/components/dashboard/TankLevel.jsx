import { useEffect, useState } from "react";
import { db } from "../../firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

export default function TankLevel({ id, fuelType, capacity }) {
    const [level, setLevel] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "tanks", id), (doc) => {
            if (doc.exists()) {
                setLevel(doc.data().currentLevel);
            } else {
                // Initialize mock data
                setDoc(doc.ref, {
                    fuelType,
                    capacity,
                    currentLevel: capacity * 0.75, // Default 75%
                    updatedAt: new Date().toISOString()
                });
                setLevel(capacity * 0.75);
            }
            setLoading(false);
        });

        return () => unsub();
    }, [id, fuelType, capacity]);

    const percentage = Math.min(100, Math.max(0, (level / capacity) * 100));

    // Color based on fuel type
    const colorClass = fuelType.toLowerCase() === 'petrol'
        ? 'bg-gradient-to-t from-orange-600 to-orange-400'
        : 'bg-gradient-to-t from-blue-600 to-blue-400';

    return (
        <div className="bg-card-bg p-6 rounded-xl border border-gray-800 flex flex-col items-center">
            <h3 className="text-gray-400 font-medium mb-4 capitalize">{fuelType} Tank</h3>

            <div className="relative w-24 h-40 bg-gray-900 rounded-full border-4 border-gray-700 overflow-hidden">
                {/* Liquid */}
                <div
                    className={`absolute bottom-0 w-full transition-all duration-1000 ease-in-out ${colorClass}`}
                    style={{ height: `${percentage}%` }}
                >
                    {/* Bubbles animation could go here */}
                    <div className="w-full h-2 bg-white/20 absolute top-0"></div>
                </div>

                {/* Glass reflection */}
                <div className="absolute top-4 left-4 w-4 h-12 bg-white/10 rounded-full blur-sm"></div>
            </div>

            <div className="mt-4 text-center">
                <p className="text-2xl font-bold text-white">{level.toLocaleString()} L</p>
                <p className="text-xs text-gray-500">of {capacity.toLocaleString()} L Capacity</p>
            </div>
        </div>
    );
}
