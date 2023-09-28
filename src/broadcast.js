const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const bitcoinjs_lib = require("bitcoinjs-lib");
const ECPairFactory = require("ecpair").ECPairFactory;
const tinysecp = require("tiny-secp256k1");
const readline = require("readline"); // Add this line

const network = bitcoinjs_lib.networks.testnet;

(async () => {
  try {
    // Read private key from keys.txt file
    const keysFilePath = path.join(__dirname, "work", "keys.txt");
    const keysData = await fs.readFile(keysFilePath, "utf-8");
    const privateKeyMatch = keysData.match(/Alice's Testnet Bitcoin private key: (.+)/);
    if (!privateKeyMatch) {
      console.error("Private key not found in keys.txt");
      return;
    }

    const alicePrivateKey = privateKeyMatch[1];
    const alice = ECPairFactory(tinysecp).fromWIF(alicePrivateKey, network);

    // Create unsigned issuance payload
    async function createUnsignedIssuance(source, text, value, feed_fee, timestamp, fee) {
      const url = "https://public.coindaddy.io:14001/api/";
      const auth = { username: "rpc", password: "1234" };
      const headers = { "Content-Type": "application/json" };
      const payload = {
        method: "create_broadcast",
        params: {
          source,
          text,
          value,
          fee_fraction: feed_fee,
          timestamp,
          fee: parseInt(fee),
          allow_unconfirmed_inputs: true,
        },
        jsonrpc: "2.0",
        id: 0,
      };
      const response = await axios.post(url, payload, { headers, auth });
      const { data } = response;
      if (!data || !data.result || data.error) {
        throw new Error(`Invalid server response. Error message: ${data.error.message}`);
      }
      return data.result;
    }

    // Prepare transaction
    async function prepareTransaction() {
      const keysFilePath = path.join(__dirname, "work", "keys.txt");
      const keysData = await fs.readFile(keysFilePath, "utf-8");
      const sourceMatch = keysData.match(/Alice's Testnet Bitcoin address: (.+)/);
      if (!sourceMatch) {
        console.error("Alice's Bitcoin address not found in keys.txt");
        return;
      }
      const source = sourceMatch[1];
      const fee = 10000; // Your fee value

      const cidFilePath = path.join(__dirname, "work", "cid.txt");
      const cid = await fs.readFile(cidFilePath, "utf-8");
      const text = `${cid}`; // Use the CID as text

      const value = 0; 
      const feed_fee = 0; 
      const timestamp = Math.floor(Date.now() / 1000); // Current Unix timestamp

      const unsignedIssuanceData = await createUnsignedIssuance(
        source,
        text,
        value,
        feed_fee,
        timestamp,
        fee
      );

      const issuanceTx = bitcoinjs_lib.Transaction.fromHex(unsignedIssuanceData);
      const psbt = new bitcoinjs_lib.Psbt({ network });

      const utxoData = await getUTXODataFromAddress(source);
      addInputs(psbt, utxoData);
      addOutputs(psbt, issuanceTx);

      issuanceTx.ins.forEach((_, idx) => {
        psbt.signInput(idx, alice);
      });

      psbt.finalizeAllInputs();

      const finalTransaction = psbt.extractTransaction().toHex();
      return finalTransaction;
    }

    // Fetch UTXO data from address
    async function getUTXODataFromAddress(source) {
      const url = `https://blockstream.info/testnet/api/address/${source}/utxo`;
      const response = await axios.get(url);
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
    }

    // Add inputs to PSBT
    function addInputs(psbt, data) {
      psbt.addInput({
        hash: data.txid,
        index: data.vout,
        nonWitnessUtxo: Buffer.from(data.fullTransaction, "hex"),
        value: data.value,
      });
    }

    // Add outputs to PSBT
    function addOutputs(psbt, tx) {
      tx.outs.forEach((output) => {
        psbt.addOutput({
          script: output.script,
          value: output.value,
        });
      });
    }

    // Broadcast transaction
    async function broadcastTransaction(finalTransaction) {
      const url = "https://blockstream.info/testnet/api/tx";
      const headers = { "Content-Type": "text/plain" };
      const response = await axios.post(url, finalTransaction, { headers });
      console.log("Broadcast response:", response.status, response.statusText);
      console.log("Transaction ID:", response.data);
    }

    const finalTransactionHex = await prepareTransaction();
    
    await broadcastTransaction(finalTransactionHex);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    process.exit(0);

   
  } catch (error) {
    console.error("Error:", error.message);
  }

  
})();
