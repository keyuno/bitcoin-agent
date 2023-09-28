const axios = require("axios");
const fs = require("fs").promises;
const bitcoinjs_lib = require("bitcoinjs-lib");
const ECPairFactory = require("ecpair").ECPairFactory;
const tinysecp = require("tiny-secp256k1");
const path = require("path");
const {
  spawn
} = require("child_process");

const network = bitcoinjs_lib.networks.testnet;

(async () => {
  try {
    // Read private key from keys.txt file
    const keysFilePath = "src/work/keys.txt";
    const keysData = await fs.readFile(keysFilePath, "utf-8");
    const bitcoinAddressMatch = keysData.match(/Alice's Testnet Bitcoin address: (.+)/);
    if (!bitcoinAddressMatch || bitcoinAddressMatch.length < 2) {
      console.error("Bitcoin address not found in keys.txt");
      return;
    }

    const bitcoinAddress = bitcoinAddressMatch[1];

    // Read NFT ID from nftid.txt file
    const nftIDFilePath = "src/work/nftid.txt";
    const nftID = await fs.readFile(nftIDFilePath, "utf-8");

    // Read CID from cid.txt file
    const cidFilePath = "src/work/cid.txt";
    const cid = await fs.readFile(cidFilePath, "utf-8");

    // Get asset information from xchain.io API
    console.log(`Fetching asset information for NFT ID: ${nftID}`);
    const assetResponse = await axios.get(`https://testnet.xchain.io/api/asset/${nftID}`);
    const assetData = assetResponse.data;

    // Display asset information
    console.log("Asset Information:");
    console.log("NFT ID:", assetData.asset);
    console.log("Description:", assetData.description);
    console.log("Supply:", assetData.supply);
    console.log("Locked:", assetData.locked);
    console.log("Divisible:", assetData.divisible);

    if (assetData.owner !== bitcoinAddress) {
      console.error("Asset is not owned by the provided address.");
      return;
    }

    console.log("Owner:", assetData.owner);

    // Check broadcasts from the address
    console.log(`Fetching broadcasts from address: ${bitcoinAddress}`);
    const broadcastsResponse = await axios.get(`https://testnet.xchain.io/api/broadcasts/${bitcoinAddress}`);
    const broadcasts = broadcastsResponse.data.data; 

    // Check if any broadcast matches the CID
    const matchingBroadcast = broadcasts.find((broadcast) => broadcast.text === cid);
    if (!matchingBroadcast) {
      console.error("No matching broadcast found for the provided CID.");
      return;
    }

    console.log("CID:", matchingBroadcast.text);

    // Get BTC balance from Blockstream API
    console.log(`Checking BTC balance for Bitcoin address: ${bitcoinAddress}`);
    const btcBalanceResponse = await axios.get(`https://blockstream.info/testnet/api/address/${bitcoinAddress}`);
    const btcBalanceSatoshis = btcBalanceResponse.data.chain_stats.funded_txo_sum;
    const btcBalance = btcBalanceSatoshis / 100000000; // Convert from satoshis to BTC

    console.log("BTC Balance:", btcBalance, "BTC");

    if (btcBalance < 0.001) {
      console.error("Insufficient BTC balance.");
      return;
    }

    // If all conditions are met, proceed with the auction
    console.log("All conditions are met. Proceed with the auction.");

    // Read private key, source, and text from files
    const privateKeyMatch = keysData.match(/Alice's Testnet Bitcoin private key: (.+)/);
    const sourceMatch = keysData.match(/Alice's Testnet Bitcoin address: (.+)/);
    const nftIdMatch = nftID.match(/(\w+)/);

    if (!privateKeyMatch || !sourceMatch || !nftIdMatch) {
      console.error("Private key, source, or NFT ID not found in files");
      return;
    }

    const fee = 10000; // Your fee value
    const alicePrivateKey = privateKeyMatch[1];
    const source = sourceMatch[1];
    const nftAssetId = nftIdMatch[1];

    const alice = ECPairFactory(tinysecp).fromWIF(alicePrivateKey, network);

    // Prompt function
    async function askQuestion(question) {
      return new Promise((resolve) => {
        const readline = require("readline").createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        readline.question(question, (answer) => {
          readline.close();
          resolve(answer);
        });
      });
    }

    const startingPrice = parseFloat(await askQuestion("Enter the starting price (BTC): "));
    const xcpPrevention = parseFloat(await askQuestion("Enter the XCP spam prevention amount: "));
    const continueAuction = await askQuestion("Would you like to proceed with the auction? (y/n): ");
    // Prompt to continue to auction
    if (continueAuction.toLowerCase() !== "y") {
      console.log("Auction aborted.");
      return;
    }
    if (continueAuction.toLowerCase() === "y") {
      console.log("Please wait..."); // Display the "Please wait..." message
    }
    
    const currentBlockNumber = await getCurrentBlockNumber();
    const expirationBlock = currentBlockNumber + 10;

    const text = `A: ${nftAssetId}, Exp. Block: ${expirationBlock}`;
    const value = startingPrice; // Starting price in BTC 
    const feed_fee = xcpPrevention; // XCP participation fee
    const timestamp = Math.floor(Date.now() / 1000); // Current Unix timestamp

    async function getCurrentBlockNumber() {
      const url = "https://blockstream.info/testnet/api/blocks/tip/height";

      try {
        const response = await axios.get(url);
        return response.data;
      } catch (error) {
        console.error("Error fetching current block number:", error.message);
        throw error;
      }
    }

    // Create unsigned issuance payload
    async function createUnsignedIssuance(source, text, value, feed_fee, timestamp, fee) {
      const url = "https://public.coindaddy.io:14001/api/";
      const auth = {
        username: "rpc",
        password: "1234",
      };
      const headers = {
        "Content-Type": "application/json",
      };
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

      try {
        const response = await axios.post(url, payload, {
          headers,
          auth,
        });

        const {
          data
        } = response;
        if (!data || !data.result || data.error) {
          throw new Error(`Invalid server response. Error message: ${data.error.message}`);
        }

        return data.result;
      } catch (error) {
        console.error("Failed to create unsigned issuance:", error.message);
        throw error;
      }
    }

    const unsignedIssuanceData = await createUnsignedIssuance(source, text, value, feed_fee, timestamp, fee);

    const issuanceTx = bitcoinjs_lib.Transaction.fromHex(unsignedIssuanceData);
    const psbt = new bitcoinjs_lib.Psbt({
      network,
    });

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

    const data = await getUTXODataFromAddress(source);
    addInputs(psbt, data);
    addOutputs(psbt, issuanceTx);

    issuanceTx.ins.forEach((_, idx) => {
      psbt.signInput(idx, alice);
    });

    psbt.finalizeAllInputs();



    // Broadcast the transaction
    const broadcastResponse = await broadcastTransaction(psbt.extractTransaction().toHex());
    console.log(
      "Broadcast response:",
      broadcastResponse.status,
      broadcastResponse.statusText
    );
    console.log("Transaction ID:", broadcastResponse.data);

    // Save broadcasted message information to a file
    const messageInfo = {
      startBlock: currentBlockNumber,
      endBlock: currentBlockNumber + 3,
      message: text,
    };
    await saveMessageInfo(messageInfo);

    async function broadcastTransaction(finalTransaction) {
      const url = "https://blockstream.info/testnet/api/tx";
      const headers = {
        "Content-Type": "text/plain",
      };

      try {
        const response = await axios.post(url, finalTransaction, {
          headers,
        });
        return response;
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

    // Function to save broadcasted message information to a file
    async function saveMessageInfo(messageInfo) {
      const messageFilePath = path.join(__dirname, "work", "broadcast.txt");
      await fs.writeFile(
        messageFilePath,
        `Start Block: ${messageInfo.startBlock}\nEnd Block: ${messageInfo.endBlock}\nMessage: ${messageInfo.message}\nStarting Price (BTC): ${value}\nXCP Participation Fee: ${feed_fee}`
      );
      console.log("Broadcasted message saved to file.");
    }
  } catch (error) {
    console.error("Error while preparing or broadcasting transaction:", error);
  }

  const liveScript = spawn("node", ["src/live.js"]);

  // Handle the output and errors of the live script
  liveScript.stdout.on("data", (data) => {
    console.log(`${data}`);
  });

  liveScript.stderr.on("data", (data) => {
    console.error(`Live script error: ${data}`);
  });

  liveScript.on("close", (code) => {
    console.log(`Live script exited with code ${code}`);
  });
})();