import React from 'react';
import ManagerNavbar from './ManagerNavbar';

export default function ManagerLayout({ children }) {
    return (
        <div className="min-h-screen bg-dark-bg text-white">
            <ManagerNavbar />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {children}
            </main>
        </div>
    );
}
