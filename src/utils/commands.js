export const COMMANDS = {
    NAVIGATE_HOME: {
        pattern: /home|dashboard/i,
        action: 'NAVIGATE',
        payload: '/'
    },
    LOGOUT: {
        pattern: /logout|sign out/i,
        action: 'LOGOUT',
        payload: null
    },
    SET_READING: {
        pattern: /reading\s+(\d+(\.\d+)?)/i, // Matches "reading 500" or "reading 500.50"
        action: 'SET_READING',
        payload: (match) => parseFloat(match[1])
    }
};
