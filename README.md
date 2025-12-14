# Titan RT Teaching Tool

A web-based interactive teaching tool for exploring Titan's atmospheric radiative transfer models. This React application provides an intuitive interface for visualizing spectral data, atmospheric profiles, and planetary images, allowing users to interactively explore how different atmospheric parameters affect Titan's observed properties.

## Key Features

- Plot spectral reflectance curves with customizable atmospheric parameters
- Click on planetary images to extract and visualize geophysical values at specific locations
- Adjust haze abundance, methane abundance, incidence/emission angles, and phase angle using sliders
- Compare spectral data from multiple locations simultaneously
- Choose between different composite image types 
- Switch between different haze property models 

## Prerequisites

This project is built with React (CRA) and npm. Before running this project locally, you'll need to have the following installed:

- **Node.js** (version 14 or higher recommended)
  - Download from [nodejs.org](https://nodejs.org/)
  - This will also install npm (Node Package Manager)
  - Verify installation by running `node --version` and `npm --version` in your terminal

- **npm** (comes with Node.js)
  - If you need to install npm separately, see [npm installation guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
  - Verify installation: `npm --version`

## Getting Started

1. **Clone the repository** (or download the project files):
   ```bash
   git clone https://github.com/KentBrought/titan-rt-teaching-tool
   cd titan-rt-teaching-tool
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```
   This will install all required packages listed in `package.json`.

3. **Start the development server**:
   ```bash
   npm start
   ```
   The application will open automatically in your browser at [http://localhost:3000](http://localhost:3000).
