import { COMMANDS } from "./commands";

export function parseCommand(text) {
    if (!text) return null;

    for (const key in COMMANDS) {
        const cmd = COMMANDS[key];
        const match = text.match(cmd.pattern);

        if (match) {
            return {
                type: cmd.action,
                payload: typeof cmd.payload === 'function' ? cmd.payload(match) : cmd.payload
            };
        }
    }

    return null;
}
