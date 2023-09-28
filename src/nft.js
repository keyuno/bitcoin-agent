const fs = require('fs');
const path = require('path');
const axios = require('axios');
const bitcoinjs_lib = require('bitcoinjs-lib');
const ECPairFactory = require('ecpair').ECPairFactory;
const tinysecp = require('tiny-secp256k1');

const network = bitcoinjs_lib.networks.testnet;

// Read private key from keys.txt file
const keysFilePath = path.join(__dirname, 'work', 'keys.txt');
fs.readFile(keysFilePath, 'utf-8', (err, data) => {
    if (err) {
        console.error('Error reading keys:', err);
        return;
    }

    const privateKeyMatch = data.match(/Alice's Testnet Bitcoin private key: (.+)/);
    if (!privateKeyMatch) {
        console.error('Private key not found in keys.txt');
        return;
    }

    const alicePrivateKey = privateKeyMatch[1];
    const alice = ECPairFactory(tinysecp).fromWIF(alicePrivateKey, network);

    // Validate the random asset
    function isValidNumericAsset(asset) {
        if (asset.length < 18 || asset.length > 21) return false;
        if (asset[0] !== 'A') return false;
        if (asset.substring(0, 2) === 'A0') return false;
        if (isNaN(parseInt(asset.substring(1)))) return false;

        const numericValue = parseInt(asset.substring(1));
        if (asset.length === 18 && numericValue < 9542895661682177) return false;
        if (asset.length === 18 && numericValue === 9542895661682177 && parseInt(asset.substring(9)) < 661682177) return false;
        if (asset.length === 21 && numericValue > 18446744073709551615) return false;
        if (asset.length === 21 && numericValue === 18446744073709551615 && parseInt(asset.substring(10)) > 73709551615) return false;

        return true;
    }

    // Generate a random numeric asset
    function generateRandomAsset() {
        const min = 9542895661682177;
        const max = 18446744073709551615;

        let randomAsset;
        do {
            const randomNumericValue = Math.floor(Math.random() * (max - min + 1)) + min;
            const assetValueString = randomNumericValue.toString();
            randomAsset = "A" + assetValueString.padStart(17, "0");
        } while (!isValidNumericAsset(randomAsset)); // Keep generating until a valid asset is generated

        return randomAsset;
    }

    // Function to create an unsigned issuance transaction
    async function createUnsignedIssuance(source, asset, quantity, description, divisible) {
        const url = 'https://public.coindaddy.io:14001/api/';
        const auth = {
            username: 'rpc',
            password: '1234'
        };
        const headers = {
            'Content-Type': 'application/json'
        };
        const payload = {
            method: 'create_issuance',
            params: {
                source,
                asset,
                quantity,
                description,
                divisible,
                lock: true,
                allow_unconfirmed_inputs: true,
            },
            jsonrpc: '2.0',
            id: 0
        };

        try {
            const response = await axios.post(url, payload, {
                headers,
                auth
            });

            const {
                data
            } = response;
            if (!data || !data.result || data.error) {
                throw new Error(`Invalid server response. Error message: ${data.error.message}`);
            }

            return data.result;
        } catch (error) {
            console.error('Failed to create unsigned issuance:', error.message);
            throw error;
        }
    }

    // Generate a random asset
    const randomAsset = generateRandomAsset();
    console.log("Generated Asset:", randomAsset);
    

    // Function to prepare the transaction
    async function prepareTransaction() {
        // Read source from keys.txt file
        const keysFilePath = path.join(__dirname, 'work', 'keys.txt');
        const keysData = fs.readFileSync(keysFilePath, 'utf-8');

        const sourceMatch = keysData.match(/Alice's Testnet Bitcoin address: (.+)/);
        if (!sourceMatch) {
            console.error("Alice's Bitcoin address not found in keys.txt");
            return;
        }

        const source = sourceMatch[1];

        // Read description from story.txt file
        const storyFilePath = path.join(__dirname, 'work', 'story.txt');
        const storyData = fs.readFileSync(storyFilePath, 'utf-8');

        const descriptionMatch = storyData.match(/Title: (.+)/);
        if (!descriptionMatch) {
            console.error('Title not found in story.txt');
            return;
        }

        const description = descriptionMatch[1];

        const asset = randomAsset; 
        const quantity = 1; 
        const divisible = false; 

        let unsignedIssuanceData = null;

        try {
            unsignedIssuanceData = await createUnsignedIssuance(source, asset, quantity, description, divisible);
        } catch (error) {
            console.error('Error while creating unsigned issuance:', error);
            throw error;
        }


        const issuanceTx = bitcoinjs_lib.Transaction.fromHex(unsignedIssuanceData);
        const psbt = new bitcoinjs_lib.Psbt({
            network
        });

        // Function to fetch UTXO data for the given source address.
        async function getUTXODataFromAddress(source) {
            const url = `https://blockstream.info/testnet/api/address/${source}/utxo`;

            try {
                const response = await axios.get(url);
                if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                    const utxo = response.data[0];
                    const txid = utxo.txid;
                    const vout = utxo.vout;
                    const value = utxo.value;

                    const fullTxResponse = await axios.get(`https://blockstream.info/testnet/api/tx/${txid}/hex`);
                    const fullTransaction = fullTxResponse.data;

                    return {
                        txid,
                        vout,
                        fullTransaction,
                        value
                    };
                } else {
                    throw new Error('No UTXO found for the provided address.');
                }
            } catch (error) {
                console.error('Failed to get UTXO data:', error.message);
                throw error;
            }
        }

        function addInputs(psbt, data) {
            psbt.addInput({
                hash: data.txid,
                index: data.vout,
                nonWitnessUtxo: Buffer.from(data.fullTransaction, 'hex'),
                value: data.value
            });
        }

        function addOutputs(psbt, tx) {
            tx.outs.forEach((output) => {
                psbt.addOutput({
                    script: output.script,
                    value: output.value
                });
            });
        }

        const data = await getUTXODataFromAddress(source);
        addInputs(psbt, data);
        addOutputs(psbt, issuanceTx);

        issuanceTx.ins.forEach((_, idx) => {
            psbt.signInput(idx, alice);
        });

        psbt.finalizeAllInputs(); // Finalize the PSBT before extracting the final transaction

        const finalTransaction = psbt.extractTransaction().toHex();
        return finalTransaction;
    }

    async function broadcastTransaction(finalTransaction) {
        const url = 'https://blockstream.info/testnet/api/tx';
        const headers = {
            'Content-Type': 'text/plain'
        };

        try {
            const response = await axios.post(url, finalTransaction, {
                headers
            });
            console.log('Broadcast response:', response.status, response.statusText);
            console.log('Transaction ID:', response.data);
        } catch (error) {
            console.error('Failed to broadcast transaction:', error.message);
            if (error.response) {
                console.error('Server response:', error.response.status, error.response.statusText);
                console.error('Response data:', error.response.data);
            }
            throw error;
        }
    }

    // Save the generated asset name to a file
    const assetFilePath = path.join(__dirname, 'work', 'nftid.txt');
    fs.writeFile(assetFilePath, randomAsset, 'utf-8', (err) => {
        if (err) {
            console.error('Error writing generated asset to file:', err);
        } else {
            console.log('Generated asset saved to:', assetFilePath);
        }
    });

    (async () => {
        try {
            const finalTransactionHex = await prepareTransaction();
            await broadcastTransaction(finalTransactionHex);
        } catch (error) {
            console.error('Error while preparing or broadcasting transaction:', error);
        }
    })();
});