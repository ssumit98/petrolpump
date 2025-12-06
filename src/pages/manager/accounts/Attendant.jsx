import { useState, useEffect } from "react";
import { db, firebaseConfig } from "../../../firebase";
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, orderBy, limit } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { UserCircle, Wallet, History, Plus, X, Save, UserPlus, Clock, Calendar as CalendarIcon } from "lucide-react";
import Calendar from "../../../components/common/Calendar";



export default function AttendantAccounts() {
    const [attendants, setAttendants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // History State
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [selectedAttendant, setSelectedAttendant] = useState(null);
    const [shiftHistory, setShiftHistory] = useState([]); // Array of Date objects
    const [selectedDateShifts, setSelectedDateShifts] = useState([]);
    const [selectedDate, setSelectedDate] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        adharNumber: "",
        autoId: ""
    });

    // Monthly Stats State
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [monthlyStats, setMonthlyStats] = useState({}); // { attendantId: totalLitres }

    useEffect(() => {
        fetchAttendants();
    }, []);

    useEffect(() => {
        fetchMonthlyStats();
    }, [selectedMonth]);

    async function fetchAttendants() {
        try {
            const q = query(collection(db, "users"), where("role", "==", "PumpAttendant"));
            const snapshot = await getDocs(q);
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAttendants(users);
        } catch (err) {
            console.error("Error fetching attendants:", err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchMonthlyStats() {
        if (!selectedMonth) return;
        try {
            const start = `${selectedMonth}-01`;
            const end = `${selectedMonth}-31`;

            // Fetch all sales for the month
            const q = query(
                collection(db, "daily_sales"),
                where("date", ">=", start),
                where("date", "<=", end)
            );

            const snapshot = await getDocs(q);
            const stats = {};

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (!stats[data.attendantId]) {
                    stats[data.attendantId] = 0;
                }
                stats[data.attendantId] += (data.totalLitres || 0);
            });

            setMonthlyStats(stats);
        } catch (err) {
            console.error("Error fetching monthly stats:", err);
        }
    }

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleAddAttendant = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError("");
        setSuccess("");

        let secondaryApp = null;

        try {
            // 1. Initialize secondary app
            secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
            const secondaryAuth = getAuth(secondaryApp);

            // 2. Create User in Auth
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, formData.email, formData.password);
            const user = userCredential.user;

            // 3. Create User Doc in Firestore (using main app's db connection)
            await setDoc(doc(db, "users", user.uid), {
                email: formData.email,
                role: "PumpAttendant",
                name: formData.name,
                adharNumber: formData.adharNumber,
                autoId: formData.autoId,
                cashInHand: 0,
                createdAt: serverTimestamp()
            });

            setSuccess("Attendant account created successfully!");
            setShowModal(false);
            setFormData({ name: "", email: "", password: "", adharNumber: "", autoId: "" });
            fetchAttendants(); // Refresh list

        } catch (err) {
            console.error("Error creating attendant:", err);
            setError(err.message);
        } finally {
            setCreating(false);
            if (secondaryApp) {
                await deleteApp(secondaryApp);
            }
        }
    };

    // History Functions
    const handleViewHistory = async (attendant) => {
        setSelectedAttendant(attendant);
        setShowHistoryModal(true);
        setSelectedDate(null);
        setSelectedDateShifts([]);

        try {
            // Fetch dates with shifts
            const historyQuery = query(
                collection(db, "shift_logs"),
                where("attendantId", "==", attendant.id),
                orderBy("startTime", "desc"),
                limit(100) // Limit to recent 100 shifts for performance
            );
            const snapshot = await getDocs(historyQuery);
            const dates = snapshot.docs.map(doc => {
                const data = doc.data();
                return data.startTime?.toDate ? data.startTime.toDate() : new Date(data.startTime);
            });
            setShiftHistory(dates);
        } catch (err) {
            console.error("Error fetching history:", err);
        }
    };

    const handleDateSelect = async (date) => {
        setSelectedDate(date);
        if (!selectedAttendant) return;

        try {
            const shiftsQuery = query(
                collection(db, "shift_logs"),
                where("attendantId", "==", selectedAttendant.id),
                orderBy("startTime", "desc"),
                limit(50)
            );

            const snapshot = await getDocs(shiftsQuery);
            const allShifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const selectedDateString = date.toDateString();

            const shiftsForDate = allShifts.filter(shift => {
                const shiftDate = shift.startTime?.toDate ? shift.startTime.toDate() : new Date(shift.startTime);
                return shiftDate.toDateString() === selectedDateString;
            });

            setSelectedDateShifts(shiftsForDate);
        } catch (err) {
            console.error("Error fetching shifts for date:", err);
        }
    };

    if (loading) return <div className="text-white">Loading...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl font-bold text-primary-orange flex items-center gap-2">
                    <UserCircle size={24} /> Attendant Accounts
                </h1>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-gray-800 p-2 rounded-lg border border-gray-700">
                        <span className="text-gray-400 text-sm">Stats for:</span>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-transparent text-white font-bold outline-none"
                        />
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-orange-600 transition-colors shadow-lg"
                    >
                        <Plus size={20} /> Add Attendant
                    </button>
                </div>
            </div>

            {success && (
                <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded-lg text-sm">
                    {success}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {attendants.map(attendant => (
                    <div key={attendant.id} className="bg-card-bg p-6 rounded-xl border border-gray-800">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-gray-400">
                                <UserCircle size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-white">{attendant.name || attendant.email?.split('@')[0]}</h3>
                                <p className="text-xs text-gray-500">{attendant.email}</p>
                                <p className="text-xs text-gray-500">ID: {attendant.autoId || 'N/A'}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-400 flex items-center gap-2"><Wallet size={14} /> Cash in Hand</span>
                                <span className="font-mono font-bold text-green-400">₹{attendant.cashInHand || 0}</span>
                            </div>

                            <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-800">
                                <span className="text-gray-400 flex items-center gap-2">Fuel Sold ({new Date(selectedMonth).toLocaleString('default', { month: 'short' })})</span>
                                <span className="font-mono font-bold text-primary-orange">
                                    {(monthlyStats[attendant.id] || 0).toFixed(2)} L
                                </span>
                            </div>

                            <button
                                onClick={() => handleViewHistory(attendant)}
                                className="w-full mt-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 text-sm flex items-center justify-center gap-2 transition-colors"
                            >
                                <History size={14} /> View History
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Attendant Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-card-bg w-full max-w-md rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-scale-in">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <UserPlus size={24} className="text-primary-orange" /> Add New Attendant
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleAddAttendant} className="p-6 space-y-4">
                            {error && (
                                <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-2 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Email (Username)</label>
                                <input
                                    type="email"
                                    name="email"
                                    required
                                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                                <input
                                    type="password"
                                    name="password"
                                    required
                                    minLength={6}
                                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Auto ID (3 Digits)</label>
                                    <input
                                        type="text"
                                        name="autoId"
                                        required
                                        maxLength={3}
                                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white"
                                        value={formData.autoId}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Adhar Number</label>
                                    <input
                                        type="text"
                                        name="adharNumber"
                                        required
                                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-orange text-white"
                                        value={formData.adharNumber}
                                        onChange={handleInputChange}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={creating}
                                className="w-full py-3 bg-primary-orange text-white font-bold rounded-xl hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                            >
                                {creating ? "Creating..." : (
                                    <>
                                        <Save size={20} /> Create Account
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {showHistoryModal && selectedAttendant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card-bg w-full max-w-4xl rounded-xl border border-gray-800 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto flex flex-col md:flex-row">
                        {/* Left Side: Calendar */}
                        <div className="p-6 border-b md:border-b-0 md:border-r border-gray-800 w-full md:w-1/2">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white">{selectedAttendant.name}'s History</h3>
                                    <p className="text-xs text-gray-400">Select a date to view shifts</p>
                                </div>
                                <button onClick={() => setShowHistoryModal(false)} className="md:hidden text-gray-400 hover:text-white"><X size={20} /></button>
                            </div>
                            <Calendar
                                onDateSelect={handleDateSelect}
                                highlightDates={shiftHistory}
                            />
                        </div>

                        {/* Right Side: Shift Details */}
                        <div className="p-6 w-full md:w-1/2 bg-gray-900/30">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-white">
                                    {selectedDate ? selectedDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : "Select a Date"}
                                </h3>
                                <button onClick={() => setShowHistoryModal(false)} className="hidden md:block text-gray-400 hover:text-white"><X size={20} /></button>
                            </div>

                            <div className="space-y-4">
                                {!selectedDate ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <CalendarIcon size={48} className="mx-auto mb-2 opacity-20" />
                                        <p>Please select a date from the calendar.</p>
                                    </div>
                                ) : selectedDateShifts.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <Clock size={48} className="mx-auto mb-2 opacity-20" />
                                        <p>No shifts recorded for this date.</p>
                                    </div>
                                ) : (
                                    selectedDateShifts.map(shift => (
                                        <div key={shift.id} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h4 className="font-bold text-primary-orange">{shift.nozzleName}</h4>
                                                    <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">{shift.fuelType}</span>
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${shift.status === 'Active' ? 'bg-green-900 text-green-400' : 'bg-blue-900 text-blue-400'}`}>
                                                    {shift.status}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                                <div className="text-gray-400">Time:</div>
                                                <div className="text-right text-white">
                                                    {shift.startTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                                                    {shift.endTime ? shift.endTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ongoing'}
                                                </div>

                                                <div className="text-gray-400">Net Sales:</div>
                                                <div className="text-right font-mono text-white">
                                                    {((shift.totalLitres || 0) - (shift.testingLitres || 0)).toFixed(2)} L
                                                </div>

                                                {shift.testingLitres > 0 && (
                                                    <>
                                                        <div className="text-gray-400 text-yellow-500">Testing:</div>
                                                        <div className="text-right font-mono text-yellow-500">
                                                            {shift.testingLitres.toFixed(2)} L
                                                        </div>
                                                    </>
                                                )}

                                                <div className="text-gray-400">Cash Handled:</div>
                                                <div className="text-right font-mono text-green-400">₹{shift.cashToHandle || 0}</div>

                                                <div className="text-gray-400">Cash Remaining:</div>
                                                <div className="text-right font-mono text-white">₹{shift.cashRemaining || 0}</div>

                                                <div className="text-gray-400">Change Given:</div>
                                                <div className="text-right font-mono text-red-400">₹{shift.change || 0}</div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
