const axios = require('axios');
const bitcoin = require('bitcoinjs-lib');

// Function to extract strings with 20 or more consecutive numbers from a string
function extractLongNumberStrings(str) {
    const matches = str.match(/\d{20,}/g);
    return matches ? matches : [];
}

// Function to convert hexadecimal data to a string
function extractMessageFromScriptPubKey(scriptpubkey_asm) {
    // Convert the hexadecimal representation to a string
    const hexString = scriptpubkey_asm.replace(/ /g, ""); // Remove spaces
    const message = Buffer.from(hexString, 'hex').toString('utf8');

    return message;
}

// Make an API call to fetch transaction details
const txid = ""; // Replace with transaction ID
const apiUrl = `https://blockstream.info/testnet/api/tx/${txid}`;

axios.get(apiUrl)
    .then(response => {
        const transaction = response.data;
        const outputs = transaction.vout;

        // Iterate through outputs and extract data from relevant scriptPubKeys
        for (const output of outputs) {
            const scriptpubkey_asm = output.scriptpubkey_asm;
            const longNumberStrings = extractLongNumberStrings(scriptpubkey_asm);

            for (const longNumberString of longNumberStrings) {
                const message = extractMessageFromScriptPubKey(longNumberString);
                console.log("Decoded Message:", message);

                // Now, convert the decoded message using bitcoinjs-lib
                const scriptBuffer = Buffer.from(message, 'hex');
                const scriptHex = scriptBuffer.toString('hex');

                const scriptASM = bitcoin.script.toASM(Buffer.from(scriptHex, 'hex'));
                console.log("Converted Script ASM:", scriptASM);
            }
        }
    })
    .catch(error => {
        console.error("Error fetching transaction details:", error);
    });