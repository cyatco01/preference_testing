const fs = require("fs");
const express = require("express");
const path = require("path");
const brain = require("brain.js");

// Function to convert CSV to text samples
function convertCsvToTextSamples(filePath) {
  const csvContent = fs.readFileSync(filePath, "utf-8");

  // Split rows and remove empty lines
  const rows = csvContent.split(/\r?\n/).filter(row => row.trim() !== "");
  const headers = rows.shift().split(",").map(header => header.trim());

  // Check if required columns exist
  const requiredColumns = ['Overview', 'Sentiment_Score', 'Valence_Score', 'Arousal_Score', 'Dominance_Score', 'Tempo'];
  for (let column of requiredColumns) {
    if (!headers.includes(column)) {
      throw new Error(`Missing required column: ${column}`);
    }
  }

  // Map rows into JSON objects
  return rows.map(row => {
    const values = row.match(/(".*?"|[^",]+|(?<=,)(?=,))/g).map(value =>
      value.replace(/^"|"$/g, "").trim()
    );

    const rowData = {};
    headers.forEach((header, index) => {
      const value = values[index];
      rowData[header] = isNaN(value) ? value : parseFloat(value);
    });

    return {
      text: rowData['Overview'],
      sentiment: parseFloat(rowData['Sentiment_Score']),
      valence: parseFloat(rowData['Valence_Score']),
      arousal: parseFloat(rowData['Arousal_Score']),
      dominance: parseFloat(rowData['Dominance_Score']),
      tempo: parseFloat(rowData['Tempo']),
    };
  });
}

// Load movie data from CSV
let moviesData;
try {
  moviesData = convertCsvToTextSamples("./movies_training.csv");
  console.log("Movies Data Loaded:", moviesData.slice(0, 5)); // Debug log
} catch (err) {
  console.error("Error loading CSV:", err);
}

const app = express();
app.use(express.json()); // Middleware for parsing JSON in POST requests

// Serve HTML with embedded JSON
app.get("/", (req, res) => {
  const htmlFile = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

  // Replace placeholder with the JSON data
  const injectedHtml = htmlFile.replace(
    '<!-- Backend will populate this JSON -->',
    JSON.stringify(moviesData)
  );

  // Send the modified HTML
  res.send(injectedHtml);
});

// Debug route to view JSON data
app.get("/test", (req, res) => {
  res.json(moviesData.slice(0, 5)); // Serve the first 5 rows for debugging
});

// Initialize Neural Network
const net = new brain.NeuralNetwork();
let trainingData = [];

// Endpoint to add user feedback to training data
app.post("/add-feedback", (req, res) => {
  const { preferredText, notPreferredText } = req.body;

  if (!preferredText || !notPreferredText) {
    return res.status(400).send("Both preferredText and notPreferredText are required.");
  }

  trainingData.push({
    input: {
      sentiment: preferredText.sentiment,
      valence: preferredText.valence,
      arousal: preferredText.arousal,
      dominance: preferredText.dominance,
      tempo: preferredText.tempo,
    },
    output: { liked: 1 },
  });

  trainingData.push({
    input: {
      sentiment: notPreferredText.sentiment,
      valence: notPreferredText.valence,
      arousal: notPreferredText.arousal,
      dominance: notPreferredText.dominance,
      tempo: notPreferredText.tempo,
    },
    output: { liked: 0 },
  });

  console.log("Feedback added to training data.");
  res.send({ message: "Feedback added successfully." });
});

// Endpoint to train the neural network and extract weights
app.post("/train", (req, res) => {
  if (trainingData.length === 0) {
    return res.status(400).send("No training data available.");
  }

  console.log("Training the network...");
  net.train(trainingData, {
    iterations: 2000,
    errorThresh: 0.005,
  });
  console.log("Network trained!");

  // Extract weights and biases
  const layers = net.toJSON().layers;
  const weightsAndBiases = layers.map((layer, index) => ({
    layer: index,
    weights: layer.weights || null,
    biases: layer.biases || null,
  }));

  console.log("Weights and biases extracted.");
  res.json(weightsAndBiases);
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
