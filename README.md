# Bitcoin-Powered Agent for NFT Creation and Auction System (Testnet)

## Overview

This project demonstrates a Bitcoin-powered agent for generating digital objects (NFTs) with the assistance of an intelligent agent and conducting auctions on Bitcoin's testnet utilizing Counterparty (XCP).

Please note that this code is intended for demonstration purposes and assumes the use of Bitcoin's testnet. In a real-world scenario, use appropriate precautions and security measures to handle real Bitcoin transactions carefully.

The project is structured into three key components:

1. **Bitcoin-Powered Agent**: Responsible for generating digital objects (NFTs).

2. **Operational Live Auction System**: Built on the principle of trust minimization.

3. **Atomic Swaps**: Facilitate the completion of transactions.
   

## Getting Started

### 1. Clone the Repository

```shell
git clone https://github.com/keyuno/bitcoin-agent
```


### 2. Navigate to the Repository

```shell
cd bitcoin-agent
```

### 3. Install Dependencies

```shell
npm install
```

### 4. Model Selection

In the `story.mjs` file, select the generative text model you will use. For this demonstration, we have chosen `llama-2-7b-chat.ggmlv3.q5_1`, available [here](https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGML). Save it in the `src/models/` directory.

To utilize the `image.js` script for image generation, you'll need to acquire a free API access token from [Hugging Face](https://huggingface.co/docs/hub/security-tokens). You can choose a text-to-image model from suggested models provided within `image.js`. 

Be sure to review the licensing terms of the chosen model before proceeding.

## Usage

### Generate NFTs

1. Start the NFT generation process:

     ```shell
     npm start
     ```

2. Note that an IPFS CID will be generated. You are responsible for hosting the file to make it accessible to others. This implementation does not include an IPFS node.

### Conducting an Auction

1. The auction system is established through the use of `create_broadcast`.

2. The `fee_fraction` parameter is utilized to determine the XCP participation fee that each bidder must pay to enter the auction.

3. The `value` parameter sets the initial price of the auction, denominated in BTC by default.

4. The duration of the auction is configurable by the seller and is measured in the number of blocks into the future.

5. [Example](https://testnet.xchain.io/tx/34474) of an asset being put up for auction:  


   - A: A601891726002205300, Exp. Block: 2503557

6. Bidders should broadcast the following message (including the `value` in BTC, which must be higher than the starting price):
  

   - B: A601891726002205300


7. To initiate the auction as a seller:

     ```shell
     npm run auction
     ```

**Note**: The current demonstration does not incorporate automated XCP spam prevention. If there is an XCP fee required to participate in the auction, bidders should destroy the specified amount of XCP from the bidding address. When destroying the XCP, they should include a text memo with the name of the auctioned asset.

### Perform Swap

1. Following the completion of the auction, both the highest bidder and the seller must closely monitor the addresses involved in the auction.

2. The seller's next step is to generate a shared address based on their own address and the address of the highest bidder. Subsequently, the seller will transfer the asset to this shared address.

     ```shell
     npm run generate
     ```

     ```shell
     npm run send
     ```

3. Once confirmed, the seller will provide the bidder with details regarding the script employed in creating the lock script. This is accomplished by broadcasting a BTC transaction wherein the script is embedded. The bidder is required to monitor the seller's address. 

     ```shell
     npm run script
     ```

4. The bidder can authenticate the script and utilize the hash of the preimage to formulate the lock script for the swap. The bidder can use `decode.js` to decode the script. 

5. The bidder will generate a shared address based on the seller's address and their own. They will then transfer the BTC amount of the bid to this shared address, allowing the seller to redeem it. The seller must monitor the bidder address and track the transaction to shared address with same approach to reveal the conditions of the script and see the amount matches the bid. 

6. In this demonstration, we utilize the `sweep` method for redeeming the asset, which necessitates an additional fee of 0.5 XCP.

     ```shell
     npm run bob
     ```

7. In the event that the deal does not proceed as planned, the seller retains the option to transfer the asset back to themselves:

      ```shell
     npm run alice
     ```


 **Note**: It's important to note that there is no obligation for either party to complete the swap. Also note that in this limited demonstration we mainly focusing on seller tokens being claimed. For more comprehensive instructions on how to execute atomic swaps, please refer to the following [resource](https://github.com/keyuno/atomic-swap-xcp).


## References

[AGI model](https://key.studio/#/?id=agi-model)

[HuggingGPT](https://arxiv.org/abs/2303.17580)

[Auction Contract](https://forums.counterparty.io/t/cip-auction-contract/6254)

[Atomic Swap Demo](https://github.com/keyuno/atomic-swap-xcp)


## Disclaimer

By using this code, you assume all risks and responsibilities for any potential loss of coins or other damages that may occur. The authors of this code do not take responsibility for any such loss or damages. Before using this code in a real-world setting, make sure to thoroughly understand the risks associated with cryptocurrencies, employ proper security measures, and exercise caution in all transactions.

## License

This code is licensed under the MIT License. See the LICENSE file for more information.

