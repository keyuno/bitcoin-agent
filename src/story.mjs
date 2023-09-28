// Import necessary modules and libraries
import { LLM } from "llama-node";
import { LLamaCpp } from "llama-node/dist/llm/llama-cpp.js";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { fork } from "child_process"; 

// Define the path to the language model
const model = path.resolve(process.cwd(), "src/models/llama-2-7b-chat.ggmlv3.q5_1.bin");

// Create an instance of the LLM class with LLamaCpp as the backend
const llama = new LLM(LLamaCpp);

// Configuration options for the LLM instance
const config = {
  modelPath: model,
  enableLogging: true,
  nCtx: 1024,
  seed: 0,
  f16Kv: false,
  logitsAll: false,
  vocabOnly: false,
  useMlock: false,
  embedding: false,
  useMmap: true,
  nGpuLayers: 0,
};

// Function to generate a random word from a given word bank
const getRandomWord = (wordBank) => {
  const randomBytes = crypto.randomBytes(4); // Use 4 bytes (32 bits) for random index
  const randomIndex = randomBytes.readUInt32LE(0) % wordBank.length;
  return wordBank[randomIndex];
};

// Function to generate a story template with random words
const generateTemplate = (wordBank) => {
  const template = "Imagine, once upon a time,";
  const randomWords = Array.from({ length: 3 }, () => getRandomWord(wordBank));
  const combinedWords = randomWords.join(" ");

  console.log(`Using random words: ${randomWords.join(", ")}`);

  return `${template} In the story, include the following words: ${combinedWords}. Be creative and draw inspiration from myths, fables and folklore. The storyline should be based on animals. `;
};

// An array of words to choose from for generating templates
const wordBank = ["house", "tree", "cloud", "river", "sun", "star", "boat", "car", "book", "flower", "beach", "mountain", "sky",  "computer", "phone", "friend", "family", "music", "water", "food", "city", "garden", "rain", "snow", "moonlight"];

// Create a prompt for generating a story
const prompt = `${generateTemplate(wordBank)}.First, provide a concise description for a text-to-image AI to craft an image encapsulating the narrative's essence using a classic visual storytelling approach. Additionally, suggest a fitting title for the story. Following this, narrate the story, adhering to the provided title, and end it without extraneous elaboration. Add 'The end' at the end of story.`;

// Parameters for story generation
const params = {
  nThreads: 4,
  nTokPredict: 2048,
  topK: 40,
  topP: 0.1,
  temp: 0.2,
  repeatPenalty: 1,
  prompt,
};

// Function to generate and save the story
const generateAndSaveStory = async () => {
  let generatedStory = "";

  // Load the language model with the specified configuration
  await llama.load(config);

  // Create story completion based on the provided parameters
  await llama.createCompletion(params, (response) => {
    process.stdout.write(response.token);
    generatedStory += response.token;
  });

  // Define the output path for the generated story
  const outputPath = path.resolve(process.cwd(), "src/work/story.txt");

  try {
    // Write the generated story to a file
    await fs.writeFile(outputPath, generatedStory, "utf-8");

    // Start the "image.js" script as a separate child process using fork
    const imageProcess = fork("src/image.js", [], { stdio: "inherit" });

    // Event listener for when the child process exits
    imageProcess.on("close", (code) => {
      console.log(`${code}`);
    });
  } catch (error) {
    console.error("Error saving the story:", error);
  }
};

// Call the function to generate and save the story
generateAndSaveStory();
