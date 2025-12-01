import { createContext, useContext, useState } from "react";

const VoiceContext = createContext();

export function useVoice() {
    return useContext(VoiceContext);
}

export function VoiceProvider({ children }) {
    const [lastCommand, setLastCommand] = useState(null);

    const dispatchCommand = (command) => {
        console.log("Dispatching command:", command);
        setLastCommand({ ...command, timestamp: Date.now() });
    };

    const value = {
        lastCommand,
        dispatchCommand
    };

    return (
        <VoiceContext.Provider value={value}>
            {children}
        </VoiceContext.Provider>
    );
}
