import React from 'react';
import './UserGuide.css';

function UserGuide() {
  return (
    <div className="user-guide">
      <div className="user-guide-content">
        <h1>User Guide</h1>
        
        <section>
          <h2>Overview</h2>
          <p>
            The Titan RT Teaching Tool is a web-based interactive teaching app for exploring Titan's atmospheric radiative transfer model outputs. It is developed by the Soderblom Lab at MIT to support education and outreach efforts for NASA's upcoming Dragonfly mission by making it easy to connect atmospheric and viewing parameters to what you see in imagery and spectra.
          </p>
        </section>

        <section>
          <h2>Intended Use</h2>
          <p>
            This tool is designed for desktop use in a web browser. It is best experienced with a mouse or trackpad so you can:
          </p>
          <ul>
            <li>Hover precisely</li>
            <li>Click specific locations</li>
            <li>Zoom into parts of the plots during explanation or discussion</li>
          </ul>
        </section>

        <section>
          <h2>How the Interface is Organized</h2>
          <ul>
            <li>Right side: Contains controls that change what is displayed</li>
            <li>Left side: Shows the IR image and the plots</li>
            <li>IR image: The place where you choose a location to sample</li>
            <li>Spectral plot: Where you view the model output for the sampled location, with its own set of display options</li>
          </ul>
        </section>

        <section>
          <h2>Selecting Points on the IR Image</h2>
          <p>
            Selecting a point on the IR image is what loads data for that specific location. When you click the image, the tool samples the model output at that point and updates the spectral plot to display the corresponding spectral data.
          </p>
          <p>
            Hovering over the IR image shows contextual information for the cursor position, such as coordinates and angles, which helps connect where you are pointing to the underlying geometry.
          </p>
          <p>
            If nothing appears in the spectral plot, it usually means no point has been selected yet or the current selection has been cleared.
          </p>
          <p>
            The interface includes a way to keep multiple selections. Enabling that option allows you to compare more than one sampled location on the spectral plot at the same time.
          </p>
        </section>

        <section>
          <h2>Gas Abundance Plot</h2>
          <p>
            The gas abundance view is another plot area that visualizes how selected settings relate to atmospheric composition or contributions. It updates based on the current configuration and is meant to complement the spectral plot by providing a second way to interpret what is driving changes you observe.
          </p>
        </section>

        <section>
          <h2>How to Interact with the Plots</h2>
          <p>
            Both the spectral plot and the gas abundance plot support standard desktop chart interactions:
          </p>
          <ul>
            <li>Hovering over a curve reveals the value at the cursor location</li>
            <li>Clicking and dragging within the plot zooms into a region, and dragging can also pan</li>
            <li>Scrolling with a mouse wheel or trackpad zooms the plot</li>
            <li>Double clicking within a plot resets the view back to the full extent</li>
            <li>If multiple traces are shown with a legend:
              <ul>
                <li>Clicking a legend entry toggles a trace on or off</li>
                <li>Double clicking a legend entry isolates that trace so it is easier to discuss</li>
              </ul>
            </li>
          </ul>
        </section>

        <section>
          <h2>Open Source and Working with the Code</h2>
          <p>
            This project is open source. If you want to run your own instance, inspect how the data is loaded, or contribute improvements, the <a href="https://github.com/KentBrought/titan-rt-teaching-tool/blob/main/README.md#titan-rt-teaching-tool" target="_blank" rel="noopener noreferrer">repository README</a> has the setup and development instructions, along with the details needed to build and modify the tool.
          </p>
        </section>
      </div>
    </div>
  );
}

export default UserGuide;

