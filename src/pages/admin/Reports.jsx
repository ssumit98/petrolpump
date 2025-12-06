import React from 'react';
import { FileBarChart } from 'lucide-react';

export default function AdminReports() {
    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-4">
                <FileBarChart className="text-primary-orange" size={32} />
                <h1 className="text-3xl font-bold text-white">Reports</h1>
            </div>
            <div className="bg-card-bg p-8 rounded-xl border border-gray-800 text-center text-gray-400">
                <p>Report generation and analytics module is coming soon.</p>
            </div>
        </div>
    );
}
