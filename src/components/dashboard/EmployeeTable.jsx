import { useEffect, useState } from "react";
import { db } from "../../firebase";
import { collection, onSnapshot, addDoc } from "firebase/firestore";

export default function EmployeeTable() {
    const [employees, setEmployees] = useState([]);

    useEffect(() => {
        // Real-time listener
        const unsub = onSnapshot(collection(db, "employees"), (snapshot) => {
            const empList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (empList.length === 0) {
                // Seed mock data if empty
                seedEmployees();
            } else {
                setEmployees(empList);
            }
        });

        return () => unsub();
    }, []);

    const seedEmployees = async () => {
        const mockData = [
            { name: "Rahul Kumar", role: "Pump Attendant", status: "Active", shortage: 0 },
            { name: "Amit Singh", role: "Pump Attendant", status: "On Leave", shortage: 0 },
            { name: "Suresh Yadav", role: "Manager", status: "Active", shortage: 0 },
        ];

        for (const emp of mockData) {
            await addDoc(collection(db, "employees"), emp);
        }
    };

    return (
        <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-800">
                <h3 className="text-xl font-semibold text-white">Employee Oversight</h3>
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
    );
}
