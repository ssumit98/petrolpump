import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export default function UpdateChecker() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log("SW Registered: " + r);
        },
        onRegisterError(error) {
            console.log("SW registration error", error);
        },
    });

    useEffect(() => {
        if (needRefresh) {
            console.log("New version available! Refreshing...");
            // Automatically update and reload
            // User requirement: "all data should get refreshed and new code changes should be visible"
            updateServiceWorker(true);
        }
    }, [needRefresh, updateServiceWorker]);

    // Optional: Check for updates periodically or on mount
    useEffect(() => {
        const interval = setInterval(() => {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.update();
                });
            }
        }, 60 * 60 * 1000); // Check every hour

        return () => clearInterval(interval);
    }, []);

    // Also render a toast if needed, but for "auto update" we might just refresh.
    // Ideally we show a toast "Updating..." then reload.
    // Given user requirement "whenever page login page loads... check", standard SW lifecycle handles this.
    // If we want explicit UI:
    if (needRefresh) {
        return (
            <div className="fixed bottom-4 left-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-xl flex items-center gap-3 animate-fade-in">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Updating Application...
            </div>
        );
    }

    return null;
}
