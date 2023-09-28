// Import required modules
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { exec } = require("child_process");
const readline = require("readline");

// Promisify the readFile function to use async/await
const readFileAsync = promisify(fs.readFile);

// Create a readline interface for reading from the command line
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Define an asynchronous function to generate HTML
async function generateHtml() {
  try {
    // Define file paths for the image and story text
    const imagePath = path.join(__dirname, "work", "image.jpg");
    const storyPath = path.join(__dirname, "work", "story.txt");

    // Read the image as a base64 encoded string and the story text
    const imageBase64 = await readFileAsync(imagePath, { encoding: "base64" });
    const storyContent = await readFileAsync(storyPath, "utf-8");

    // Extract title and story content using regular expressions
    const titleMatch = storyContent.match(/Title: (.+)/);
    const storyMatch = storyContent.match(/(Once upon a time[\s\S]+)<end>/);

    // Check if title or story content is not found
    if (!titleMatch || !storyMatch) {
      console.error("Title or story content not found in story.txt");
      return;
    }

    // Extract the title and story content
    const title = titleMatch[1].trim();
    const story = storyMatch[1];

    // Create the HTML content
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
          }
          .container {
            display: flex;
          }
          .image {
            flex: 1;
            padding: 20px;
          }
          .image img {
            max-width: 100%;
          }
          .content {
            flex: 2;
            padding: 20px;
          }
          .title {
            font-size: 36px;
            font-weight: bold;
            margin-bottom: 20px;
            font-family: 'Times New Roman', serif;
          }
          .story {
            font-size: 18px;
            line-height: 1.6;
          }
          .story p {
            margin-bottom: 20px;
          }
          .ending {
            font-weight: bold;
            margin-top: 40px;
            font-size: 18px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="image">
            <img src="data:image/jpeg;base64,${imageBase64}" alt="Image">
          </div>
          <div class="content">
            <div class="title">${title}</div>
            <div class="story">${story.replace(/\n/g, "<br>")}</div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Define the file path for the generated HTML file
    const htmlFilePath = path.join(__dirname, "work", "story.html");

    // Write the HTML content to the file
    await fs.promises.writeFile(htmlFilePath, htmlContent, "utf-8");

    // Start the "src/nft.js" process using child_process.exec
    const nftProcess = exec("node src/nft.js", async (error, stdout, stderr) => {
      if (error) {
        console.error("Error running src/nft.js:", error);
      } else {
        console.log("src/nft.js completed.");

        // Run the "src/ipfs.js" process after "src/nft.js" completes
        const ipfsProcess = exec("node src/ipfs.js", (ipfsError, ipfsStdout, ipfsStderr) => {
          if (ipfsError) {
            console.error("Error running src/ipfs.js:", ipfsError);
          } else {
            console.log("src/ipfs.js completed.");

            // Extract the directory of the HTML file
            const htmlFileDirectory = path.dirname(htmlFilePath);

            // Construct and log a message
            console.log(`The generated HTML file saved in: ${htmlFileDirectory}`);
            console.log("NFT Creation Complete.");

            // Exit the Node.js process when both processes are done
            process.exit(0);
          }
        });

        // Pipe the output of "src/ipfs.js" to the standard output
        ipfsProcess.stdout.pipe(process.stdout);
        ipfsProcess.stderr.pipe(process.stderr);
      }
    });

    // Pipe the output of "src/nft.js" to the standard output
    nftProcess.stdout.pipe(process.stdout);
    nftProcess.stderr.pipe(process.stderr);

  } catch (error) {
    console.error("Error generating HTML:", error);
  }
}

// Call the generateHtml function to start the process
generateHtml();
