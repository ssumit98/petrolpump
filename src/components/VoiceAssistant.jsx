import { useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import useVoiceNav from "../hooks/useVoiceNav";
import { parseCommand } from "../utils/commandParser";
import { useVoice } from "../contexts/VoiceContext";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function VoiceAssistant() {
    const { isListening, transcript, startListening, stopListening, resetTranscript, error } = useVoiceNav();
    const { dispatchCommand } = useVoice();
    const { logout } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (transcript) {
            const command = parseCommand(transcript);
            if (command) {
                handleGlobalCommand(command);
            }
            // Reset transcript after processing to allow new commands
            // We might want to wait a bit or do it immediately
            const timer = setTimeout(() => resetTranscript(), 1000);
            return () => clearTimeout(timer);
        }
    }, [transcript]);

    const handleGlobalCommand = (command) => {
        switch (command.type) {
            case 'NAVIGATE':
                navigate(command.payload);
                break;
            case 'LOGOUT':
                logout();
                navigate('/login');
                break;
            default:
                // Dispatch to context for page-specific handling
                dispatchCommand(command);
                break;
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
            {/* Transcript Bubble */}
            {(transcript || error) && (
                <div className="bg-black/80 text-white px-4 py-2 rounded-lg backdrop-blur-sm text-sm mb-2 max-w-xs transition-all">
                    {error ? <span className="text-red-400">{error}</span> : transcript}
                </div>
            )}

            {/* FAB */}
            <button
                onClick={isListening ? stopListening : startListening}
                className={`p-4 rounded-full shadow-2xl transition-all transform hover:scale-110 ${isListening
                        ? "bg-red-500 animate-pulse ring-4 ring-red-500/30"
                        : "bg-primary-orange hover:bg-orange-600"
                    }`}
            >
                {isListening ? <MicOff size={24} color="white" /> : <Mic size={24} color="white" />}
            </button>
        </div>
    );
}
