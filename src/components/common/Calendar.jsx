import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Calendar({ onDateSelect, highlightDates = [] }) {
    const [currentDate, setCurrentDate] = useState(new Date());

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const handleDateClick = (day) => {
        const selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        // Reset time to midnight for consistent comparison
        selectedDate.setHours(0, 0, 0, 0);
        onDateSelect(selectedDate);
    };

    const isHighlighted = (day) => {
        const dateToCheck = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        dateToCheck.setHours(0, 0, 0, 0);
        return highlightDates.some(d => {
            const highlightDate = new Date(d);
            highlightDate.setHours(0, 0, 0, 0);
            return highlightDate.getTime() === dateToCheck.getTime();
        });
    };

    const isToday = (day) => {
        const today = new Date();
        return day === today.getDate() &&
            currentDate.getMonth() === today.getMonth() &&
            currentDate.getFullYear() === today.getFullYear();
    };

    const renderDays = () => {
        const days = [];
        // Empty slots for days before the first day of the month
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<div key={`empty-${i}`} className="h-10"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const hasShift = isHighlighted(day);
            const today = isToday(day);

            days.push(
                <button
                    key={day}
                    onClick={() => handleDateClick(day)}
                    className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-all
                        ${today ? 'border-2 border-primary-orange text-white' : ''}
                        ${hasShift ? 'bg-green-600/20 text-green-400 hover:bg-green-600/40' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}
                        ${!hasShift && !today ? '' : 'font-bold'}
                    `}
                >
                    {day}
                    {hasShift && <div className="absolute bottom-1 w-1 h-1 bg-green-500 rounded-full"></div>}
                </button>
            );
        }
        return days;
    };

    return (
        <div className="bg-card-bg p-4 rounded-xl border border-gray-800 w-full max-w-sm mx-auto">
            <div className="flex justify-between items-center mb-4">
                <button onClick={prevMonth} className="p-1 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white">
                    <ChevronLeft size={20} />
                </button>
                <h3 className="text-white font-bold">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h3>
                <button onClick={nextMonth} className="p-1 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white">
                    <ChevronRight size={20} />
                </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                    <div key={`${day}-${index}`} className="text-xs text-gray-500 font-bold">{day}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1 place-items-center">
                {renderDays()}
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 justify-center">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Shift Completed</span>
            </div>
        </div>
    );
}
