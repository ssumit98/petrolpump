import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const [debugInfo, setDebugInfo] = useState({
        secure: typeof window !== 'undefined' ? window.isSecureContext : false,
        sw: typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'Supported' : 'Unsupported',
        controller: typeof navigator !== 'undefined' && navigator.serviceWorker?.controller ? 'Active' : 'None',
        eventFired: false
    });

    useEffect(() => {
        const handler = (e) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            console.log("PWA: beforeinstallprompt fired");
            setDebugInfo(prev => ({ ...prev, eventFired: true }));
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
            setIsVisible(true);
        };

        window.addEventListener("beforeinstallprompt", handler);

        // Check SW status
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(() => {
                setDebugInfo(prev => ({ ...prev, controller: 'Ready' }));
            });
        }

        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) {
            if (import.meta.env.DEV) {
                alert("Dev Mode: Install prompt event hasn't fired yet. In production, this would only appear when the browser allows installation.");
            }
            return;
        }

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);

        // We've used the prompt, and can't use it again, throw it away
        setDeferredPrompt(null);
        setIsVisible(false);
    };

    // In development, we want to see the button to verify styling, 
    // even if the browser doesn't think it's installable yet.
    const showButton = isVisible || import.meta.env.DEV;

    // NOTE: Debug overlay is always visible for troubleshooting
    return (
        <>
            {showButton && (
                <div className="fixed bottom-20 right-4 z-50 animate-bounce-in">
                    <button
                        onClick={handleInstallClick}
                        className="group flex items-center gap-3 bg-primary-orange text-white px-4 py-3 rounded-full shadow-2xl hover:bg-orange-600 transition-all transform hover:scale-105"
                    >
                        <div className="bg-white/20 p-2 rounded-full">
                            <Download size={20} className="text-white" />
                        </div>
                        <div className="text-left">
                            <p className="text-xs font-semibold text-orange-100 uppercase tracking-wider">Get the App</p>
                            <p className="text-sm font-bold">Install Now</p>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsVisible(false);
                            }}
                            className="ml-2 text-white/50 hover:text-white"
                        >
                            <X size={16} />
                        </button>
                    </button>
                </div>
            )}

            {/* PWA Debug Overlay - visible on Production for now */}
            <div className="fixed bottom-4 left-4 bg-black/90 text-green-400 p-2 text-[10px] rounded z-50 font-mono pointer-events-none opacity-80 max-w-[200px]">
                <p>Secure: {debugInfo.secure ? 'Yes' : 'No'}</p>
                <p>SW: {debugInfo.sw} / {debugInfo.controller}</p>
                <p>Event: {debugInfo.eventFired ? 'FIRED' : 'WAITING'}</p>
                <p>Mode: {import.meta.env.DEV ? 'Dev' : 'Prod'}</p>
            </div>
        </>
    );
}
