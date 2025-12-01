import { useState, useEffect, useRef } from "react";

export default function useVoiceNav() {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [error, setError] = useState("");

    const recognitionRef = useRef(null);

    useEffect(() => {
        // Check browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            setError("Browser does not support Speech Recognition.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false; // Stop after one sentence/command
        recognition.interimResults = false; // Only final results
        recognition.lang = "en-IN"; // Indian English

        recognition.onstart = () => {
            setIsListening(true);
            setError("");
        };

        recognition.onresult = (event) => {
            const current = event.resultIndex;
            const transcriptText = event.results[current][0].transcript;
            setTranscript(transcriptText.toLowerCase());
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            if (event.error === 'not-allowed') {
                setError("Microphone access denied.");
            } else if (event.error === 'no-speech') {
                setError("No speech detected. Try again.");
            } else {
                setError(`Error: ${event.error}`);
            }
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    const startListening = () => {
        if (recognitionRef.current && !isListening) {
            try {
                setTranscript(""); // Clear previous
                recognitionRef.current.start();
            } catch (err) {
                console.error("Failed to start recognition:", err);
            }
        }
    };

    const stopListening = () => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
        }
    };

    const resetTranscript = () => {
        setTranscript("");
    };

    return {
        isListening,
        transcript,
        error,
        startListening,
        stopListening,
        resetTranscript
    };
}
