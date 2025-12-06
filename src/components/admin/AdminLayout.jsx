import React from 'react';
import AdminNavbar from './AdminNavbar';

export default function AdminLayout({ children }) {
    return (
        <div className="min-h-screen bg-dark-bg text-white">
            <AdminNavbar />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {children}
            </main>
        </div>
    );
}
