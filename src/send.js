const fs = require("fs");
const path = require("path");
const axios = require("axios");
const bitcoinjs_lib = require("bitcoinjs-lib");
const ECPairFactory = require("ecpair").ECPairFactory;
const tinysecp = require("tiny-secp256k1");
const {
    spawn
} = require('child_process');

const network = bitcoinjs_lib.networks.testnet;

// Read private key from keys.txt file
const keysFilePath = path.join(__dirname, "work", "keys.txt");
fs.readFile(keysFilePath, "utf-8", (err, data) => {
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

    async function createUnsignedSend(source, destination, asset, quantity) {
        const url = "https://public.coindaddy.io:14001/api/";
        const auth = {
            username: "rpc",
            password: "1234",
        };
        const headers = {
            "Content-Type": "application/json",
        };
        const payload = {
            method: "create_send",
            params: {
                source,
                destination,
                asset,
                quantity,
                allow_unconfirmed_inputs: true,
            },
            jsonrpc: "2.0",
            id: 0,
        };

        try {
            const response = await axios.post(url, payload, {
                headers,
                auth,
            });

            const {
                data
            } = response;
            if (!data || !data.result || data.error) {
                throw new Error(
                    `Invalid server response. Error message: ${data.error.message}`
                );
            }

            return data.result;
        } catch (error) {
            console.error("Failed to create unsigned send:", error.message);
            throw error;
        }
    }
    // Function to read the asset name from the text file
    function readAssetNameFromFile(filename) {
        try {
            const data = fs.readFileSync(filename, "utf8");
            const match = /(\w+)/.exec(data);
            if (match) {
                return match[1]; // Extract the asset name from the regex match
            } else {
                throw new Error("Asset name not found in the file.");
            }
        } catch (error) {
            console.error("Error reading asset name from file:", error.message);
            throw error;
        }
    }

    const assetNameFilePath = path.join(__dirname, "work", "nftid.txt");
    const asset = readAssetNameFromFile(assetNameFilePath);


    // Function to read the destination address from the text file
    function readDestinationAddressFromFile(filename) {
        try {
            const data = fs.readFileSync(filename, "utf8");
            const match = /(\w+)/.exec(data);
            if (match) {
                return match[0]; // Extract the destination address from the regex match
            } else {
                throw new Error("Destination address not found in the file.");
            }
        } catch (error) {
            console.error("Error reading destination address from file:", error.message);
            throw error;
        }
    }

    const destinationAddressFilePath = path.join(__dirname, "work", "shared.txt");

    // Read the destination address from the file
    const destinationAddress = readDestinationAddressFromFile(destinationAddressFilePath);

    // Function to read the source address from the text file
    function readSourceAddressFromFile(filename) {
        try {
            const data = fs.readFileSync(filename, "utf8");
            const addressMatch = /Alice's Testnet Bitcoin address: (\w+)/.exec(data);
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

    const keysFilePath = path.join(__dirname, "work", "keys.txt");

    // Read the source address from the file
    const sourceAddress = readSourceAddressFromFile(keysFilePath);

    const quantity = 1;


    (async () => {
        try {
            const unsignedSendData = await createUnsignedSend(
                sourceAddress,
                destinationAddress,
                asset,
                quantity
            );
            const unsignedSendTx =
                bitcoinjs_lib.Transaction.fromHex(unsignedSendData);

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


            function addInputs(psbt, data) {
                psbt.addInput({
                    hash: data.txid,
                    index: data.vout,
                    nonWitnessUtxo: Buffer.from(data.fullTransaction, "hex"),
                    value: data.value,
                });
            }

            function addOutputs(psbt, tx) {
                tx.outs.forEach((output) => {
                    psbt.addOutput({
                        script: output.script,
                        value: output.value,
                    });
                });
            }


            const data = await getUTXODataFromAddress(sourceAddress);
            addInputs(psbt, data);
            addOutputs(psbt, unsignedSendTx);

            unsignedSendTx.ins.forEach((_, idx) => {
                psbt.signInput(idx, alice);
            });

            psbt.finalizeAllInputs(); // Finalize the PSBT before extracting the final transaction

            const finalTransaction = psbt.extractTransaction().toHex();

            // Broadcast the final transaction
            await broadcastTransaction(finalTransaction);
        } catch (error) {
            console.error(
                "Error while preparing or broadcasting transaction:",
                error
            );
        }
    })();
});
// Function to broadcast the transaction to the network.
async function broadcastTransaction(signedTxHex) {
    const url = "https://blockstream.info/testnet/api/tx";
    const headers = {
        "Content-Type": "text/plain",
    };

    try {
        const response = await axios.post(url, signedTxHex, {
            headers,
        });
        console.log("Broadcast response:", response.status, response.statusText);
        console.log("Transaction ID:", response.data);
        startTransferScript()
    } catch (error) {
        console.error("Failed to broadcast transaction:", error.message);
        if (error.response) {
            console.error(
                "Server response:",
                error.response.status,
                error.response.statusText
            );
            console.error("Response data:", error.response.data);
        }
        throw error;
    }
}
async function startTransferScript() {
    console.log("Please wait...");
    await new Promise((resolve) => setTimeout(resolve, 60000));

   
    const templateProcess = spawn('node', ['src/transfer.js']);

    templateProcess.stdout.on('data', (data) => {
        console.log(`${data}`);
    });

    templateProcess.on('close', (code) => {
        console.log(`${code}`);
    });
}