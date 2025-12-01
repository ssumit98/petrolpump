import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    CheckSquare,
    Droplets,
    Truck,
    Users,
    LogOut,
    Menu,
    X,
    ChevronDown,
    CreditCard,
    UserCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function ManagerNavbar() {
    const { logout, currentUser } = useAuth();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isAccountsOpen, setIsAccountsOpen] = useState(false);

    const isActive = (path) => location.pathname === path;

    const navLinks = [
        { name: 'Daily Sheet', path: '/manager/operations', icon: LayoutDashboard },
        { name: 'Shift Verification', path: '/manager/shift-verification', icon: CheckSquare },
        { name: 'Stock / Dip', path: '/manager/stock', icon: Droplets },
        { name: 'Vendor Management', path: '/manager/vendors', icon: Truck },
    ];

    return (
        <nav className="bg-card-bg border-b border-gray-800 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo / Brand */}
                    <div className="flex items-center">
                        <Link to="/manager/operations" className="text-xl font-bold text-primary-orange flex items-center gap-2">
                            <LayoutDashboard size={24} />
                            <span>Manager Portal</span>
                        </Link>
                    </div>

                    {/* Desktop Navigation */}
                    <div className="hidden md:block">
                        <div className="ml-10 flex items-baseline space-x-4">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.name}
                                    to={link.path}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
                                        ${isActive(link.path)
                                            ? 'bg-primary-orange text-white'
                                            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                        }`}
                                >
                                    <link.icon size={16} />
                                    {link.name}
                                </Link>
                            ))}

                            {/* Accounts Dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setIsAccountsOpen(!isAccountsOpen)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
                                        ${location.pathname.includes('/manager/accounts')
                                            ? 'bg-primary-orange text-white'
                                            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                        }`}
                                >
                                    <Users size={16} />
                                    Accounts
                                    <ChevronDown size={14} />
                                </button>

                                {isAccountsOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-card-bg border border-gray-700 rounded-md shadow-lg py-1 z-50 animate-fade-in">
                                        <Link
                                            to="/manager/accounts/credit"
                                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                                            onClick={() => setIsAccountsOpen(false)}
                                        >
                                            <CreditCard size={16} /> Credit Accounts
                                        </Link>
                                        <Link
                                            to="/manager/accounts/attendant"
                                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                                            onClick={() => setIsAccountsOpen(false)}
                                        >
                                            <UserCircle size={16} /> Attendant Accounts
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* User Profile & Logout */}
                    <div className="hidden md:flex items-center gap-4">
                        <span className="text-sm text-gray-400">
                            {currentUser?.email?.split('@')[0]}
                        </span>
                        <button
                            onClick={logout}
                            className="p-2 bg-red-600/20 text-red-500 rounded-full hover:bg-red-600/30 transition-colors"
                            title="Logout"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>

                    {/* Mobile menu button */}
                    <div className="-mr-2 flex md:hidden">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none"
                        >
                            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMobileMenuOpen && (
                <div className="md:hidden bg-card-bg border-t border-gray-800">
                    <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                        {navLinks.map((link) => (
                            <Link
                                key={link.name}
                                to={link.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium block
                                    ${isActive(link.path)
                                        ? 'bg-primary-orange text-white'
                                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                    }`}
                            >
                                <link.icon size={18} />
                                {link.name}
                            </Link>
                        ))}

                        <div className="px-3 py-2 text-gray-400 font-bold text-xs uppercase tracking-wider">Accounts</div>
                        <Link
                            to="/manager/accounts/credit"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white block pl-6"
                        >
                            <CreditCard size={18} /> Credit Accounts
                        </Link>
                        <Link
                            to="/manager/accounts/attendant"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white block pl-6"
                        >
                            <UserCircle size={18} /> Attendant Accounts
                        </Link>

                        <div className="border-t border-gray-700 mt-4 pt-4">
                            <button
                                onClick={logout}
                                className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium text-red-500 hover:bg-red-600/20 w-full"
                            >
                                <LogOut size={18} /> Logout
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
}
