// api/webhook.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// --- CONFIGURATION ---
// We expect FIREBASE_SERVICE_ACCOUNT to be an Environment Variable in Vercel.
// It should be the JSON content of the service account file.
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn("Missing FIREBASE_SERVICE_ACCOUNT environment variable.");
}

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : {};

if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();

export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const update = req.body;
        console.log("Incoming Webhook:", JSON.stringify(update, null, 2));

        if (!update || !update.message || !update.message.text) {
            return res.status(200).send('Ignored: No text');
        }

        const chatId = update.message.chat.id;
        const text = update.message.text;

        // --- PARSING ---
        const data = parseTelegramMessage(text);
        if (!data) {
            // Optional: Reply help message if parse fails?
            // await sendMessage(chatId, "❌ Could not parse message. Please check format.");
            return res.status(200).send('Parse Error - Ignored');
        }

        // --- PROCESSING ---
        await processJobEntry(chatId, data);

        return res.status(200).send('OK');

    } catch (error) {
        console.error("Webhook Error:", error);
        return res.status(500).send('Internal Server Error');
    }
}

// ---------------- BUSINESS LOGIC (Ported) ----------------

function parseTelegramMessage(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    // Extract Name
    const nameLine = lines.find(l => l.toLowerCase().startsWith('name'));
    if (!nameLine) return null;
    const name = nameLine.split(':')[1]?.trim();
    if (!name) return null;

    // Extract Financials
    const extractValue = (key) => {
        const line = lines.find(l => l.toLowerCase().startsWith(key.toLowerCase()));
        if (!line) return 0;
        const val = line.split(':')[1]?.trim();
        return parseFloat(val) || 0;
    };

    const cash = extractValue('Cash');
    const paytm = extractValue('Paytm');
    const phonePe = extractValue('Phonepay'); // "Phonepay"
    const expenses = extractValue('Expenses');
    const change = extractValue('Short/ change');
    const credit = extractValue('Credit');

    // Extract Nozzles
    const nozzles = [];
    let currentNozzle = null;

    for (const line of lines) {
        const lowerLine = line.toLowerCase();

        if (lowerLine.startsWith('nozzle')) {
            const val = line.split(':')[1]?.trim();
            currentNozzle = { nameOrId: val };
            nozzles.push(currentNozzle);
        } else if (lowerLine.startsWith('end reading') && currentNozzle) {
            const val = line.split(':')[1]?.trim();
            currentNozzle.endReading = parseFloat(val);
        }
    }

    if (nozzles.length === 0) return null;

    return {
        staffName: name,
        nozzles,
        financials: { cash, paytm, phonePe, expenses, change, credit }
    };
}

async function processJobEntry(chatId, data) {
    try {
        // 1. Find User (Smart Fuzzy Search)
        const usersRef = db.collection('users');
        // Logic: Try exact, then try case-insensitive partial match
        // Firestore doesn't support native case-insensitive search easily without specific fields.
        // Better: Fetch all meaningful users (e.g., Pump Attendants) or just all users if small set.
        // Given typically < 50 staff, fetching all is okay for this automation.

        const allUsersSnap = await usersRef.get();
        const allUsers = allUsersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const inputNameLower = data.staffName.toLowerCase();

        // Find matches where DB name includes input name
        // e.g. Input "appa" matches "Appa Sabale"
        const matchedUsers = allUsers.filter(u =>
            (u.name && u.name.toLowerCase().includes(inputNameLower)) ||
            (u.email && u.email.toLowerCase().includes(inputNameLower)) // Fallback to email just in case
        );

        if (matchedUsers.length === 0) {
            await sendMessage(chatId, `❌ Staff "${data.staffName}" not found.`);
            return;
        }

        if (matchedUsers.length > 1) {
            // Ambiguity check
            // e.g. "Raju" matches "Raju 1" and "Raju 2"
            // Pick exact start match if possible? Or just error.
            const exactHits = matchedUsers.filter(u => u.name.toLowerCase() === inputNameLower);
            if (exactHits.length === 1) {
                // Resolved
            } else {
                const namesFound = matchedUsers.map(u => u.name).join(", ");
                await sendMessage(chatId, `⚠️ Ambiguous name "${data.staffName}". Found: ${namesFound}. Please be more specific.`);
                return;
            }
        }

        // Use the first (best) match
        const bestMatch = matchedUsers.length > 1
            ? matchedUsers.find(u => u.name.toLowerCase() === inputNameLower) || matchedUsers[0]
            : matchedUsers[0];

        const userId = bestMatch.id;
        const userData = bestMatch; // already data
        const userEmail = userData.email;

        // 2. Identify Nozzles
        const allNozzlesSnap = await db.collection('nozzles').get();
        const allNozzles = allNozzlesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const matchedNozzles = [];

        // Helper: Extract valid number from string (e.g. "Nozzle 6 - Petrol" -> 6)
        const extractNumber = (str) => {
            const match = str.match(/(\d+)/);
            return match ? parseInt(match[0], 10) : null;
        };

        for (const inputNozzle of data.nozzles) {
            // Strategy: 
            // 1. Try exact ID match
            // 2. Try extracting number from input and matching with number in DB name

            const inputNum = extractNumber(inputNozzle.nameOrId);

            const found = allNozzles.find(n => {
                if (n.id === inputNozzle.nameOrId) return true;
                if (inputNum !== null) {
                    const dbNum = extractNumber(n.nozzleName);
                    return dbNum === inputNum;
                }
                return false;
            });

            if (!found) {
                await sendMessage(chatId, `❌ Nozzle "${inputNozzle.nameOrId}" not found. (Check if number matches DB)`);
                return;
            }
            matchedNozzles.push({ doc: found, endReading: inputNozzle.endReading });
        }

        // 3. Transactions
        const neededFuelTypes = [...new Set(matchedNozzles.map(m => m.doc.fuelType))];

        await db.runTransaction(async (transaction) => {
            // A. Reference Checks (User)
            const authorRef = db.collection('users').doc(userId);
            const authorSnap = await transaction.get(authorRef);
            if (!authorSnap.exists) throw "User missing";

            // B. Tank Reads
            const tankMap = {};
            const tankUpdates = {};

            // Note: In firebase-admin, we can query inside transaction, but to match logic 
            // we will try to fetch tank docs if possible. 
            // Workaround: Get all tanks of these types.
            for (const type of neededFuelTypes) {
                const q = db.collection('tanks').where('fuelType', '==', type);
                const qSnap = await transaction.get(q);
                qSnap.forEach(doc => {
                    tankMap[type] = { ref: doc.ref, data: doc.data() };
                });
            }

            // C. Calculations
            const shiftRef = db.collection('shift_logs').doc();
            let totalLitres = 0;
            const shiftNozzles = [];
            const dailySalesDocs = [];

            for (const item of matchedNozzles) {
                const nozzleData = item.doc;
                const startReading = nozzleData.currentMeterReading;
                const endReading = item.endReading;

                if (endReading < startReading) {
                    throw `Error: End Reading < Start for ${nozzleData.nozzleName}`;
                }

                const sold = endReading - startReading;
                totalLitres += sold;

                const fuelType = nozzleData.fuelType;
                if (!tankUpdates[fuelType]) tankUpdates[fuelType] = 0;
                tankUpdates[fuelType] += sold;

                shiftNozzles.push({
                    nozzleId: nozzleData.id,
                    nozzleName: nozzleData.nozzleName,
                    fuelType: nozzleData.fuelType,
                    startReading: startReading,
                    endReading: endReading,
                    totalLitres: sold,
                    testingLitres: 0
                });

                // Daily Log
                const today = new Date().toISOString().split('T')[0];
                const salesRef = db.collection('daily_sales').doc();
                dailySalesDocs.push({
                    ref: salesRef,
                    data: {
                        date: today,
                        attendantId: userId,
                        attendantEmail: userEmail,
                        nozzleId: nozzleData.id,
                        nozzleName: nozzleData.nozzleName,
                        fuelType: nozzleData.fuelType,
                        startReading: startReading,
                        endReading: endReading,
                        totalLitres: sold,
                        testingLitres: 0,
                        netLitres: sold,
                        timestamp: FieldValue.serverTimestamp(),
                    }
                });
            }

            // D. Writes
            // Shift Log
            const { cash, paytm, phonePe, expenses, change, credit } = data.financials;
            const currentCashInHand = userData.cashInHand || 0;

            transaction.set(shiftRef, {
                attendantId: userId,
                attendantName: userEmail,
                startTime: FieldValue.serverTimestamp(),
                endTime: FieldValue.serverTimestamp(),

                // Legacy / Summary
                nozzleId: shiftNozzles[0].nozzleId,
                nozzleName: matchedNozzles.map(m => m.doc.nozzleName).join(', '),
                fuelType: matchedNozzles.length > 1 ? "Mixed" : shiftNozzles[0].fuelType,

                // Totals
                totalLitres: totalLitres,
                testingLitres: 0,
                netLitres: totalLitres, // Since testing is 0

                // Data
                nozzles: shiftNozzles,

                // Financials (Start)
                previousCashInHand: currentCashInHand,
                cashToHandle: 0,

                // Financials (End)
                cashReturned: cash,
                cashRemaining: 0,
                paytm: paytm,
                phonePe: phonePe,
                expenses: expenses,
                change: change,
                credit: credit,

                status: "PendingEndVerification"
            });

            // Nozzles
            for (const item of matchedNozzles) {
                const nRef = db.collection('nozzles').doc(item.doc.id);
                transaction.update(nRef, { currentMeterReading: item.endReading });
            }

            // User Cash
            transaction.update(authorRef, { cashInHand: 0 });

            // Tanks
            for (const [fuelType, amount] of Object.entries(tankUpdates)) {
                if (tankMap[fuelType]) {
                    const { ref, data } = tankMap[fuelType];
                    const currentLevel = data.currentLevel || 0;
                    transaction.update(ref, { currentLevel: currentLevel - amount });
                }
            }

            // Daily Sales
            for (const sale of dailySalesDocs) {
                transaction.set(sale.ref, sale.data);
            }
        });

        await sendMessage(chatId, `✅ Successfully Logged Job for ${data.staffName}!`);

    } catch (e) {
        console.error("Transaction Error:", e);
        await sendMessage(chatId, `❌ Error: ${e.message || e}`);
    }
}

const TELEGRAM_TOKEN = "8586097147:AAEW1878xFcDyfy6dRJW1MElVPuRYBd7KGk";

async function sendMessage(chatId, text) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text })
        });
    } catch (e) {
        console.error("Telegram Send Error:", e);
    }
}
