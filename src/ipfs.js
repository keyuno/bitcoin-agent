const fs = require('fs').promises;
const path = require('path');
const Hash = require('ipfs-only-hash');
const { exec } = require('child_process');

// Function to generate the CID for a file
async function generateFileHash(filePath) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const cid = await Hash.of(fileContent);
    return cid;
  } catch (error) {
    console.error('An error occurred:', error.message);
    throw error;
  }
}

// Function to rename an HTML file
async function renameHtmlFile(htmlFilePath, newHtmlFilePath) {
  try {
    await fs.rename(htmlFilePath, newHtmlFilePath);
    console.log('Renamed HTML file to:', path.basename(newHtmlFilePath));
  } catch (error) {
    console.error('Error renaming HTML file:', error.message);
    throw error;
  }
}

async function main() {
  const storyFilePath = path.join(__dirname, 'work', 'story.txt');
  const htmlFilePath = path.join(__dirname, 'work', 'story.html');
  const cidFilePath = path.join(__dirname, 'work', 'cid.txt');

  try {
    // Read the story content from the file
    const storyContent = await fs.readFile(storyFilePath, 'utf-8');

    // Extract the title from the story content
    const titleMatch = storyContent.match(/Title: (.+)/);

    if (!titleMatch) {
      console.error('Title not found in story.txt');
      process.exit(1);
    }

    const title = titleMatch[1].trim();

    // Create the new HTML file name using the extracted title
    const sanitizedTitle = title.replace(/[\/:*?"<>|]/g, ''); // Remove invalid filename characters
    const newHtmlFilePath = path.join(__dirname, 'work', `${sanitizedTitle}.html`);

    // Rename the HTML file
    await renameHtmlFile(htmlFilePath, newHtmlFilePath);

    // Generate the CID for the HTML file
    const cid = await generateFileHash(newHtmlFilePath);
    console.log(`CID of ${sanitizedTitle}.html: ${cid}`);

    // Write the CID to a file
    await fs.writeFile(cidFilePath, cid);
    console.log('Please wait...');

    // Wait before starting src/broadcast.js
    setTimeout(() => {
      const broadcastProcess = exec('node src/broadcast.js', (error, stdout, stderr) => {
        if (error) {
          console.error('Error running src/broadcast.js:', error);
          process.exit(1); // Exit the application with an error code
        } else {
          console.log('src/broadcast.js completed.');
          process.exit(0); // Exit the application successfully
        }
      });

      // Handle broadcast.js process output if needed
      broadcastProcess.stdout.pipe(process.stdout);
      broadcastProcess.stderr.pipe(process.stderr);
    }, 10000); // delay
  } catch (error) {
    console.error('An error occurred:', error.message);
    process.exit(1); // Exit the application with an error code
  }
}

main();
