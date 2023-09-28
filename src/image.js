// Import necessary modules
const https = require('https');
const fs = require('fs');
const { spawn } = require('child_process');

// Define your Hugging Face API token and the model ID you want to use
const API_TOKEN = ''; // Hugging face token

// Select text-to-image model
const modelId = 'runwayml/stable-diffusion-v1-5'; //'stabilityai/stable-diffusion-2-1';

const filePath = 'src/work/story.txt'; // Path to the input text file

// Read the content of the input text file asynchronously
fs.readFile(filePath, 'utf-8', (err, content) => {
  if (err) {
    console.error('Error reading story.txt:', err);
    return;
  }

  // Extract the image description from the content of the file
  const imageDescriptionMatch = content.match(/Image Description: (.+)/);
  if (!imageDescriptionMatch) {
    console.error('Image description not found in story.txt');
    return;
  }

  const imageDescription = imageDescriptionMatch[1].trim();
  console.log('Extracted image description:', imageDescription);

  // Define the data to send to the Hugging Face model
  const data = {
    inputs: `Classic illustration: ${imageDescription}`,
    options: {
      wait_for_model: true
    }
  };

  // Configure HTTP request options
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  // Send a POST request to the Hugging Face model API
  const req = https.request(`https://api-inference.huggingface.co/models/${modelId}`, options, (response) => {
    let bufferData = Buffer.from([]);

    // Receive data in chunks and concatenate it into bufferData
    response.on('data', (chunk) => {
      bufferData = Buffer.concat([bufferData, chunk]);
    });

    // When the response ends, save the received image to a file
    response.on('end', () => {
      const imageOutputPath = 'src/work/image.jpg';
      fs.writeFile(imageOutputPath, bufferData, (err) => {
        if (err) {
          console.error('Error saving image:', err);
        } else {
          console.log('Image saved successfully:', imageOutputPath);
          // After saving the image, start the template.js script
          startTemplateScript();
        }
      });
    });
  });

  // Handle errors in the HTTP request
  req.on('error', (error) => {
    console.error('Error:', error);
  });

  // Write the data to the request body and send the request
  req.write(JSON.stringify(data));
  req.end();
});

// Function to start the template.js script using child_process.spawn
function startTemplateScript() {
  const templateProcess = spawn('node', ['src/template.js']);

  // Listen for standard output from the child process
  templateProcess.stdout.on('data', (data) => {
    console.log(`${data}`);
  });

  // Listen for errors from the child process
  templateProcess.stderr.on('data', (data) => {
    console.error(`Template script error: ${data}`);
  });

  // Listen for the child process to close
  templateProcess.on('close', (code) => {
    console.log(`${code}`);
  });
}
