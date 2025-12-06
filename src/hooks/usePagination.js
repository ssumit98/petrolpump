import { useState, useMemo } from 'react';

export default function usePagination(data = [], itemsPerPage = 10) {
    const [currentPage, setCurrentPage] = useState(1);

    const totalPages = Math.ceil(data.length / itemsPerPage);

    const currentData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        return data.slice(start, end);
    }, [data, currentPage, itemsPerPage]);

    const nextPage = () => {
        if (currentPage < totalPages) setCurrentPage(p => p + 1);
    };

    const prevPage = () => {
        if (currentPage > 1) setCurrentPage(p => p - 1);
    };

    const goToPage = (page) => {
        const pageNumber = Math.max(1, Math.min(page, totalPages));
        setCurrentPage(pageNumber);
    };

    // Reset to page 1 if data changes significantly (optional, but good UX filters)
    // For now we keep it simple manually if needed, or rely on staying on page 1 initially.

    return {
        currentData,
        currentPage,
        totalPages,
        nextPage,
        prevPage,
        goToPage,
        hasPages: totalPages > 1
    };
}
