import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PaginationControls({ currentPage, totalPages, onNext, onPrev, hasPages }) {
    if (!hasPages) return null;

    return (
        <div className="flex items-center justify-center gap-4 mt-4 p-4 border-t border-gray-800">
            <button
                onClick={onPrev}
                disabled={currentPage === 1}
                className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Previous Page"
            >
                <ChevronLeft size={20} />
            </button>

            <span className="text-sm text-gray-400 font-medium">
                Page <span className="text-white">{currentPage}</span> of <span className="text-white">{totalPages}</span>
            </span>

            <button
                onClick={onNext}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Next Page"
            >
                <ChevronRight size={20} />
            </button>
        </div>
    );
}
