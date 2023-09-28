// Import necessary Node.js modules and libraries
const fs = require('fs'); 
const path = require('path'); 
const axios = require('axios'); 
const { networks, payments } = require('bitcoinjs-lib'); 
const { ECPairFactory } = require('ecpair'); 
const tinysecp = require('tiny-secp256k1'); 
const ECPair = ECPairFactory(tinysecp); 

// Define the Bitcoin network (testnet in this case)
const NETWORK = networks.testnet;

// Generate a random private key for Alice
const alicePrivateKey = ECPair.makeRandom({
  network: NETWORK,
}).toWIF();

// Generate Alice's public key from her private key
const alicebPublicKey = ECPair.fromWIF(alicePrivateKey, NETWORK).publicKey;

// Generate Alice's Bitcoin address from her public key
const aliceAddress = payments.p2pkh({
  pubkey: alicebPublicKey,
  network: NETWORK,
}).address;

// Create a message box with Alice's Bitcoin address
const messageBox = `
******************************************************************************
                                                  
    Send 0.001 Testnet BTC to the Bitcoin agent address below to continue:                     
                                                  
    Bitcoin Agent Address: ${aliceAddress}         
                                                 
******************************************************************************`;

// Prepare a text message with Alice's Bitcoin address and private key
const outputText = `Alice's Testnet Bitcoin address: ${aliceAddress}\nAlice's Testnet Bitcoin private key: ${alicePrivateKey}\n`;

// Define the file path for saving Alice's Bitcoin address and private key
const keysFilePath = path.join(__dirname, 'work', 'keys.txt');

// Write Alice's Bitcoin address and private key to a file
fs.writeFile(keysFilePath, outputText, 'utf-8', (err) => {
  if (err) {
    console.error('Error saving keys:', err);
  } else {
    // Log Alice's Bitcoin address and private key
    console.log("Alice's Testnet Bitcoin address:", aliceAddress);
    console.log("Alice's Testnet Bitcoin private key:", alicePrivateKey);
    
    // Display the message box
    console.log(messageBox);

    // Start checking Alice's Bitcoin balance
    startBalanceCheck();
  }
});

// Function to start checking Alice's Bitcoin balance
function startBalanceCheck() {
  const checkInterval = 60000; // Check balance every 1 minute
  const desiredBalance = 100000; // 0.001 Testnet BTC in satoshis

  // Set up an interval for checking the balance
  const balanceCheckInterval = setInterval(async () => {
    try {
      // Make an API request to fetch Alice's Bitcoin address balance
      const response = await axios.get(
        `https://blockstream.info/testnet/api/address/${aliceAddress}`
      );

      // Extract Alice's current balance from the API response
      const balance = response.data.chain_stats.funded_txo_sum;

      // Check if Alice has received the desired balance
      if (balance >= desiredBalance) {
        console.log(`Received and confirmed 0.001 Testnet BTC!`);
        clearInterval(balanceCheckInterval); // Stop the balance check
        startStoryScript(); // Start the story.mjs script after receiving BTC
      } else {
        console.log(
          `Waiting for 0.001 Testnet BTC. Current balance: ${balance / 100000} BTC`
        );
      }
    } catch (error) {
      console.error('Error checking balance:', error.message);
    }
  }, checkInterval);
}

// Function to start the story.mjs script
function startStoryScript() {
  console.log('Starting the story.mjs script...');
  
  try {
    // Dynamically import the 'story.mjs' module
    import('./story.mjs')
      .catch((error) => {
        console.error('Error starting story.mjs:', error);
      });
  } catch (error) {
    console.error('Error starting story.mjs:', error);
  }
}
