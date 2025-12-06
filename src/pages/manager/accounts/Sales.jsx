import { useState, useEffect } from "react";
import { db } from "../../../firebase";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { TrendingUp, Calendar, Search, FileText, Download, AlertCircle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function Sales() {
    const [sheets, setSheets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [error, setError] = useState("");

    useEffect(() => {
        fetchSheets();
    }, [selectedMonth]);

    async function fetchSheets() {
        setLoading(true);
        setError("");
        try {
            // Calculate start and end of the selected month
            const [year, month] = selectedMonth.split('-');
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);

            // Since date is stored as string YYYY-MM-DD in daily_sheets doc ID or date field
            // We can query by date string range
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const q = query(
                collection(db, "daily_sheets"),
                where("date", ">=", startStr),
                where("date", "<=", endStr),
                orderBy("date", "desc")
            );

            const snapshot = await getDocs(q);
            setSheets(snapshot.docs.map(doc => doc.data()));

        } catch (err) {
            console.error("Error fetching sales sheets:", err);
            setError("Failed to load sales data.");
        } finally {
            setLoading(false);
        }
    }

    const downloadReport = () => {
        const doc = new jsPDF();

        doc.setFontSize(20);
        doc.setTextColor(255, 100, 0);
        doc.text(`Sales Report - ${selectedMonth}`, 14, 22);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

        const tableData = sheets.map(sheet => [
            sheet.date,
            `Rs ${sheet.totalPayment?.toFixed(2) || '0.00'}`,
            `Rs ${sheet.totalExpense?.toFixed(2) || '0.00'}`,
            `Rs ${sheet.netCollection?.toFixed(2) || '0.00'}`
        ]);

        // Calculate Totals
        const totalSales = sheets.reduce((sum, s) => sum + (s.totalPayment || 0), 0);
        const totalExpenses = sheets.reduce((sum, s) => sum + (s.totalExpense || 0), 0);
        const netTotal = totalSales - totalExpenses;

        tableData.push([
            "TOTAL",
            `Rs ${totalSales.toFixed(2)}`,
            `Rs ${totalExpenses.toFixed(2)}`,
            `Rs ${netTotal.toFixed(2)}`
        ]);

        autoTable(doc, {
            startY: 40,
            head: [['Date', 'Total Sales', 'Total Expenses', 'Net Collection']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [255, 100, 0] },
            footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
        });

        doc.save(`Sales_Report_${selectedMonth}.pdf`);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl font-bold text-primary-orange flex items-center gap-2">
                    <TrendingUp size={24} /> Sales Account
                </h1>

                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-orange"
                        />
                    </div>

                    <button
                        onClick={downloadReport}
                        disabled={sheets.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors border border-gray-700 disabled:opacity-50"
                    >
                        <Download size={18} /> Export PDF
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            <div className="bg-card-bg rounded-xl border border-gray-800 overflow-hidden shadow-lg">
                <div className="p-4 border-b border-gray-800 flex items-center gap-2">
                    <FileText size={18} className="text-gray-400" />
                    <h3 className="font-semibold text-white">Daily Sales History</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-gray-900/50 uppercase font-medium text-xs text-gray-500">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3 text-right">Total Sales (₹)</th>
                                <th className="px-4 py-3 text-right">Total Expenses (₹)</th>
                                <th className="px-4 py-3 text-right">Net Collection (₹)</th>
                                <th className="px-4 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {loading ? (
                                <tr><td colSpan="5" className="px-4 py-8 text-center">Loading...</td></tr>
                            ) : sheets.length === 0 ? (
                                <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500">No records found for this month.</td></tr>
                            ) : (
                                <>
                                    {sheets.map((sheet, index) => (
                                        <tr key={index} className="hover:bg-gray-800/30 transition-colors">
                                            <td className="px-4 py-3 font-medium text-white">
                                                {new Date(sheet.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-green-400">
                                                ₹{(sheet.totalPayment || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-red-400">
                                                ₹{(sheet.totalExpense || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-mono font-bold ${(sheet.netCollection || 0) >= 0 ? 'text-white' : 'text-red-500'}`}>
                                                ₹{(sheet.netCollection || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="px-2 py-1 bg-green-500/20 text-green-500 rounded-full text-xs font-bold">
                                                    Saved
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Summary Row */}
                                    <tr className="bg-gray-900/50 font-bold text-white">
                                        <td className="px-4 py-3">TOTAL</td>
                                        <td className="px-4 py-3 text-right text-green-500">
                                            ₹{sheets.reduce((sum, s) => sum + (s.totalPayment || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3 text-right text-red-500">
                                            ₹{sheets.reduce((sum, s) => sum + (s.totalExpense || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3 text-right text-primary-orange">
                                            ₹{(sheets.reduce((sum, s) => sum + (s.totalPayment || 0), 0) - sheets.reduce((sum, s) => sum + (s.totalExpense || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td></td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
