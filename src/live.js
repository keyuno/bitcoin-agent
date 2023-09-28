const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');

const API_URL_BASE = 'https://testnet.xchain.io/api/broadcasts/';
const BITCOIN_API_URL_BASE = 'https://blockstream.info/testnet/api/';
const AVERAGE_CONFIRMATION_TIME_MINUTES = 10;
const API_REQUEST_INTERVAL_MS = 90000; 

async function getCurrentBitcoinBlockNumber() {
  try {
    const response = await axios.get(`${BITCOIN_API_URL_BASE}blocks/tip/height`);
    return response.data;
  } catch (error) {
    console.error('Error fetching current Bitcoin testnet block number:', error.message);
    throw error;
  }
}

async function processBroadcastsInBlock(blockNumber, targetMessage, bidsArray, processedBlocks, startingBid) {
  if (processedBlocks.has(blockNumber)) {
    return;
  }

  try {
    const response = await axios.get(`${API_URL_BASE}${blockNumber}`);

    if (!response.data) {
      throw new Error('No data received from the API.');
    }

    const broadcastsData = response.data.data;

    if (broadcastsData && broadcastsData.length > 0) {
      const filteredBlockBroadcasts = broadcastsData.filter(broadcast => broadcast.text === targetMessage);

      console.log(`ℹ️ Found ${filteredBlockBroadcasts.length} broadcasts matching the target message in block ${blockNumber}:`);
      let highestBid = getHighestBid(bidsArray); // Initialize highestBid for this block

      for (const broadcast of filteredBlockBroadcasts) {
        const bidValueRaw = broadcast.value;

        if (typeof bidValueRaw !== 'undefined') {
          const bidValue = parseFloat(bidValueRaw); // Parse the value as a float
          const bidSource = broadcast.source;
          const bidInfo = {
            blockNumber,
            source: bidSource,
            bidValue,
          };

          // Check if this bid has already been processed
          if (!isBidProcessed(bidInfo, bidsArray) && bidValue >= startingBid) {
            bidsArray.push(bidInfo); // Store bid information in the array
            console.log(`🎉 Found a valid bid in block ${blockNumber}:`);
            console.log(`💼 Bid Source: ${bidInfo.source}`);
            console.log(`🌟 Bid Amount: ${bidInfo.bidValue} BTC`); // Indicate that the bid is valid

            // Update the highest bid if a higher bid is found for this block
            if (bidValue > highestBid.value) {
              highestBid = {
                source: bidSource,
                value: bidValue
              };
            }
          }
        } else {
          console.log(`❌ Bid in block ${blockNumber} has no value.`);
        }
      }

      // Print the highest bid for this block
      console.log(`🔝 Highest Bid in block ${blockNumber}: ${highestBid.value} BTC by ${highestBid.source}`);

      // Mark the block as processed
      processedBlocks.add(blockNumber);
    } else {
      console.log(`ℹ️ No data available for block ${blockNumber}.`);
    }
  } catch (error) {
    console.error(`🚨 Error while exploring block ${blockNumber}:`, error.message || error);
  }
}

// Function to check if a bid has already been processed
function isBidProcessed(bid, bidsArray) {
  return bidsArray.some(existingBid => (
    existingBid.blockNumber === bid.blockNumber &&
    existingBid.source === bid.source &&
    existingBid.bidValue === bid.bidValue
  ));
}

// Function to get the highest bid from the bids array
function getHighestBid(bidsArray) {
  return bidsArray.reduce((highestBid, currentBid) => {
    if (currentBid.bidValue > highestBid.value) {
      highestBid.value = currentBid.bidValue;
      highestBid.source = currentBid.source;
    }
    return highestBid;
  }, {
    source: '',
    value: 0
  });
}

async function saveBidsToJson(bidsArray) {
  try {
    const outputPath = path.join(__dirname, 'work', 'bids.json');
    await fs.writeFile(outputPath, JSON.stringify(bidsArray, null, 2));
  } catch (error) {
    console.error('Error saving bids to JSON:', error.message || error);
  }
}

async function checkBlocksInWindow(startBlock, endBlock, targetMessage, startingBid) {
    let bidsArray = []; // Array to store bid information
    const processedBlocks = new Set(); // Set to keep track of processed blocks
  
    try {
      console.log(`🎉 Auction has started! 🎉`);
      console.log(`🧾 Starting Price: ${startingBid} BTC`);
      console.log(`⏳ Average Block Confirmation Time: ${AVERAGE_CONFIRMATION_TIME_MINUTES} minutes`);
      console.log(`🚀 Start Block: ${startBlock}`);
      console.log(`🔚 End Block: ${endBlock}`); // Display start and end blocks
  
      while (true) {
        const currentBitcoinBlockNumber = await getCurrentBitcoinBlockNumber();
  
        if (currentBitcoinBlockNumber >= startBlock && currentBitcoinBlockNumber <= endBlock) {
          await processBroadcastsInBlock(currentBitcoinBlockNumber, targetMessage, bidsArray, processedBlocks, startingBid);
          console.log(`⏳ Current block: ${currentBitcoinBlockNumber}`);
          console.log(`🔝 Highest Bid: ${getHighestBid(bidsArray).value} BTC by ${getHighestBid(bidsArray).source}`);
  
          // Save the bids to the JSON file each time a bid is found
          await saveBidsToJson(bidsArray);
        }
  
        if (currentBitcoinBlockNumber >= endBlock) {
          break; // Exit the loop when the end block is reached
        }
  
        // Sleep for a while to avoid making continuous requests
        await new Promise(resolve => setTimeout(resolve, API_REQUEST_INTERVAL_MS));
      }
  
      console.log(`🚀 Auction has ended! Thank you for participating! 🚀`);
  
      // Display the final highest bid from the bids array
      const finalHighestBid = getHighestBid(bidsArray);
      console.log(`🔝 Final Highest Bid: ${finalHighestBid.value} BTC by ${finalHighestBid.source}`);
  
      // Save the final highest bid to highest_bid.txt
      const winFilePath = path.join(__dirname, 'work', 'highest_bid.txt');
      const winData = `Address: ${finalHighestBid.source}, Amount Bid: ${finalHighestBid.value} BTC`;
  
      await fs.writeFile(winFilePath, winData);
      process.exit(0); // Use 0 to indicate a successful exit
    } catch (error) {
      console.error('Error in the auction:', error.message || error);
      process.exit(1); // Use 1 to indicate an exit due to an error
    }
  }
(async () => {
  const broadcastFilePath = path.join(__dirname, 'work', 'broadcast.txt');

  try {
    const broadcastData = await fs.readFile(broadcastFilePath, 'utf-8');
    const startBlockMatch = broadcastData.match(/Start Block: (\d+)/);
    const endBlockMatch = broadcastData.match(/End Block: (\d+)/);
    const messageMatch = broadcastData.match(/Message: A: (\w+),/);
    const startingPriceMatch = broadcastData.match(/Starting Price \(BTC\): ([\d.]+)/);

    if (!startBlockMatch || !endBlockMatch || !messageMatch || !startingPriceMatch) {
      throw new Error('Error: Unable to extract values from broadcast.txt');
    }

    const startBlock = parseInt(startBlockMatch[1]);
    const endBlock = parseInt(endBlockMatch[1]);
    const assetName = messageMatch[1];
    const targetMessage = `B: ${assetName}`;
    const startingBid = parseFloat(startingPriceMatch[1]);

    await checkBlocksInWindow(startBlock, endBlock, targetMessage, startingBid);
  } catch (error) {
    console.error('Error reading broadcast.txt or starting the auction:', error.message || error);
    process.exit(1);
  }
})();
