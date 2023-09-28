const fs = require("fs");
const path = require("path");
const axios = require("axios");
const bitcoinjs_lib = require("bitcoinjs-lib");
const ECPairFactory = require("ecpair").ECPairFactory;
const tinysecp = require("tiny-secp256k1");

const network = bitcoinjs_lib.networks.testnet;

// Read private key from keys.txt file
const keysFilePath = path.join(__dirname, "work", "keys.txt");
fs.readFile(keysFilePath, "utf-8", async (err, data) => {
    if (err) {
        console.error("Error reading keys:", err);
        return;
    }

    const privateKeyMatch = data.match(
        /Alice's Testnet Bitcoin private key: (.+)/
    );
    if (!privateKeyMatch) {
        console.error("Private key not found in keys.txt");
        return;
    }

    const alicePrivateKey = privateKeyMatch[1];
    const alice = ECPairFactory(tinysecp).fromWIF(alicePrivateKey, network);

    // Function to read the destination address from the text file
    function readDestinationAddressFromFile(filename) {
        try {
            const data = fs.readFileSync(filename, "utf8");
            const match = /(\w+)/.exec(data);
            if (match) {
                return match[0]; 
            } else {
                throw new Error("Destination address not found in the file.");
            }
        } catch (error) {
            console.error(
                "Error reading destination address from file:",
                error.message
            );
            throw error;
        }
    }

    const destinationAddressFilePath = path.join(
        __dirname,
        "work",
        "shared.txt"
    );

    // Read the destination address from the file
    const destinationAddress = readDestinationAddressFromFile(
        destinationAddressFilePath
    );

    // Function to read the source address from the text file
    function readSourceAddressFromFile(filename) {
        try {
            const data = fs.readFileSync(filename, "utf8");
            const addressMatch = /Alice's Testnet Bitcoin address: (\w+)/.exec(
                data
            );
            if (addressMatch) {
                return addressMatch[1]; 
            } else {
                throw new Error("Source address not found in the file.");
            }
        } catch (error) {
            console.error("Error reading source address from file:", error.message);
            throw error;
        }
    }

    // Read the source address from the file
    const sourceAddress = readSourceAddressFromFile(keysFilePath);
    console.log("Source address:", sourceAddress); // Log the source address

    function addInputs(psbt, data) {
        psbt.addInput({
            hash: data.txid,
            index: data.vout,
            nonWitnessUtxo: Buffer.from(data.fullTransaction, "hex"),
            value: data.value,
        });
    }

    try {
        const psbt = new bitcoinjs_lib.Psbt({
            network,
        });

        // Function to fetch UTXO data for the given source address.
        async function getUTXODataFromAddress(source) {
            const url = `https://blockstream.info/testnet/api/address/${source}/utxo`;

            try {
                const response = await axios.get(url);
                if (
                    response.data &&
                    Array.isArray(response.data) &&
                    response.data.length > 0
                ) {
                    const utxo = response.data[0];
                    const txid = utxo.txid;
                    const vout = utxo.vout;
                    const value = utxo.value;

                    const fullTxResponse = await axios.get(
                        `https://blockstream.info/testnet/api/tx/${txid}/hex`
                    );
                    const fullTransaction = fullTxResponse.data;

                    return {
                        txid,
                        vout,
                        fullTransaction,
                        value,
                    };
                } else {
                    throw new Error("No UTXO found for the provided address.");
                }
            } catch (error) {
                console.error("Failed to get UTXO data:", error.message);
                throw error;
            }
        }


        const data = await getUTXODataFromAddress(sourceAddress);
        addInputs(psbt, data);

        const satoshisToSend = 16180;
        const back = 60000;


        psbt.addOutput({
            address: destinationAddress,
            value: satoshisToSend
        });

        // Add an additional output
        psbt.addOutput({
            address: sourceAddress,
            value: back,
        });

        // Read the message from the file
        const messageFilePath = 'src/work/lock.txt';
        const message = fs.readFileSync(messageFilePath, 'utf8');

        // Create a custom script that pushes your message onto the stack
        const customScript = bitcoinjs_lib.script.compile([
            Buffer.from(message, 'utf8'), // Your message as a byte array
        ]);

        psbt.addOutput({
            script: customScript,
            value: 0, // Set the value to 0
        });

        // Sign the inputs and finalize the PSBT
        psbt.signAllInputs(alice); // Sign all inputs with Alice's private key

        psbt.finalizeAllInputs();

        const finalTransaction = psbt.extractTransaction().toHex();

        // Function to broadcast a transaction to the Blockstream testnet
        async function broadcastTransaction(transactionHex) {
            const broadcastUrl = "https://blockstream.info/testnet/api/tx";
            try {
                const response = await axios.post(broadcastUrl, transactionHex, {
                    headers: {
                        "Content-Type": "text/plain",
                    },
                });

                if (response.status === 200) {
                    console.log("Transaction successfully broadcasted.");
                    console.log("Transaction ID:", response.data);
                } else {
                    console.error("Failed to broadcast transaction. HTTP Status Code:", response.status);
                }
            } catch (error) {
                console.error("Error broadcasting transaction:", error.message);
            }
        }


        // Broadcast the final transaction
        await broadcastTransaction(finalTransaction);

    } catch (error) {
        console.error("Error while preparing or broadcasting transaction:", error);
    }
});