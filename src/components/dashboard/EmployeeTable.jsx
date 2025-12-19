import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { db } from "../../firebase";
import { collection, onSnapshot, addDoc } from "firebase/firestore";

export default function EmployeeTable() {
    const [employees, setEmployees] = useState([]);

    useEffect(() => {
        // Real-time listener
        const unsub = onSnapshot(collection(db, "employees"), (snapshot) => {
            const empList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (empList.length === 0) {
                // No employees found
            } else {
                setEmployees(empList);
            }
        });

        return () => unsub();
    }, []);

    const [showAddModal, setShowAddModal] = useState(false);
    const [newEmployee, setNewEmployee] = useState({ name: "", role: "Pump Attendant", status: "Active", shortage: 0 });
    const [loading, setLoading] = useState(false);

    const handleAddEmployee = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await addDoc(collection(db, "employees"), newEmployee);
            setShowAddModal(false);
            setNewEmployee({ name: "", role: "Pump Attendant", status: "Active", shortage: 0 });
        } catch (error) {
            console.error("Error adding employee:", error);
        }
        setLoading(false);
    };

    return (
        <>
            <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="text-xl font-semibold text-white">Employee Oversight</h3>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 bg-primary-orange/20 text-primary-orange px-3 py-1.5 rounded-lg hover:bg-primary-orange hover:text-white transition-colors text-sm font-medium"
                    >
                        <Plus size={16} />
                        Add Employee
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-gray-400">
                        <thead className="bg-gray-900/50 text-xs uppercase font-medium">
                            <tr>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-6 py-4">Role</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Cash Shortage</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {employees.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                                        No employees found. Add one to get started.
                                    </td>
                                </tr>
                            )}
                            {employees.map((emp) => (
                                <tr key={emp.id} className="hover:bg-gray-800/30 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white">{emp.name}</td>
                                    <td className="px-6 py-4">{emp.role}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs ${emp.status === 'Active' ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'
                                            }`}>
                                            {emp.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-red-400">
                                        {emp.shortage > 0 ? `-₹${emp.shortage}` : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Employee Modal */}
            {
                showAddModal && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-card-bg border border-gray-700 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-white">Add New Employee</h3>
                                <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleAddEmployee} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={newEmployee.name}
                                        onChange={e => setNewEmployee({ ...newEmployee, name: e.target.value })}
                                        className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-primary-orange"
                                        placeholder="Employee Name"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Role</label>
                                    <select
                                        value={newEmployee.role}
                                        onChange={e => setNewEmployee({ ...newEmployee, role: e.target.value })}
                                        className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-primary-orange"
                                    >
                                        <option value="Pump Attendant">Pump Attendant</option>
                                        <option value="Manager">Manager</option>
                                        <option value="Security">Security</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Status</label>
                                    <select
                                        value={newEmployee.status}
                                        onChange={e => setNewEmployee({ ...newEmployee, status: e.target.value })}
                                        className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-primary-orange"
                                    >
                                        <option value="Active">Active</option>
                                        <option value="On Leave">On Leave</option>
                                        <option value="Inactive">Inactive</option>
                                    </select>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-primary-orange hover:bg-orange-600 text-white font-bold py-3 rounded-lg mt-2 transition-colors disabled:opacity-50"
                                >
                                    {loading ? "Adding..." : "Add Employee"}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
        </>
    );
}
