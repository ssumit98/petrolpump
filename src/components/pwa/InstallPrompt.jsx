import { useState, useEffect } from "react";
import { Download, X, MoreVertical, Share } from "lucide-react";

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const [showInstructions, setShowInstructions] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Check if already installed/standalone
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone ||
            document.referrer.includes('android-app://');

        if (isStandalone) {
            setIsVisible(false);
            return;
        }

        // Check if iOS (for specific instructions)
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        setIsIOS(ios);

        // Show button after a delay to allow page load
        const timer = setTimeout(() => {
            setIsVisible(true);
        }, 2000);

        const handler = (e) => {
            e.preventDefault();
            console.log("PWA: Event fired");
            setDeferredPrompt(e);
            // Ensure visible if event fires
            setIsVisible(true);
        };

        window.addEventListener("beforeinstallprompt", handler);

        return () => {
            window.removeEventListener("beforeinstallprompt", handler);
            clearTimeout(timer);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) {
            // Fallback: Show instructions
            setShowInstructions(true);
            return;
        }

        // Native Prompt
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response: ${outcome}`);
        setDeferredPrompt(null);
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <>
            {/* Install Button */}
            {!showInstructions && (
                <div className="fixed bottom-20 right-4 z-50 animate-bounce-in">
                    <div
                        onClick={handleInstallClick}
                        className="group flex items-center gap-3 bg-primary-orange text-white px-4 py-3 rounded-full shadow-2xl hover:bg-orange-600 transition-all transform hover:scale-105 cursor-pointer"
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
                    </div>
                </div>
            )}

            {/* Manual Install Instructions Modal */}
            {showInstructions && (
                <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in"
                    onClick={() => setShowInstructions(false)}>
                    <div className="bg-card-bg border border-gray-700 w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl relative"
                        onClick={e => e.stopPropagation()}>

                        <button onClick={() => setShowInstructions(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                            <X size={20} />
                        </button>

                        <div className="text-center space-y-4">
                            <div className="bg-primary-orange/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-primary-orange">
                                <Download size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-white">Install App</h3>

                            <p className="text-gray-300 text-sm">
                                To install the app properly, please follow these steps:
                            </p>

                            <ol className="text-left text-sm space-y-3 bg-gray-900/50 p-4 rounded-lg">
                                {isIOS ? (
                                    <>
                                        <li className="flex items-center gap-2 text-gray-300">
                                            <span className="bg-gray-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                                            Tap the <Share size={16} className="text-blue-400" /> Share button
                                        </li>
                                        <li className="flex items-center gap-2 text-gray-300">
                                            <span className="bg-gray-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                                            Scroll down and tap "Add to Home Screen"
                                        </li>
                                    </>
                                ) : (
                                    <>
                                        <li className="flex items-center gap-2 text-gray-300">
                                            <span className="bg-gray-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                                            Tap the <MoreVertical size={16} className="text-gray-400" /> menu button
                                        </li>
                                        <li className="flex items-center gap-2 text-gray-300">
                                            <span className="bg-gray-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                                            Select "Add to Home Screen" or "Install App"
                                        </li>
                                    </>
                                )}
                            </ol>

                            <button
                                onClick={() => setShowInstructions(false)}
                                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
