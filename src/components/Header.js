import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import soderblomLogo from '../assets/soderblom_lab.png';
import '../App.css';

function Header() {
  const [rtExpanded, setRtExpanded] = useState(false);
  const [rtExpansionText, setRtExpansionText] = useState({ left: 'Radiative', right: 'Transfer' });

  return (
    <header className="app-header">
      <div className="header-left">
        <a
          href="https://soderblomlab.mit.edu/"
          target="_blank"
          rel="noopener noreferrer"
          className="header-soderblom-link"
          aria-label="Soderblom Lab at MIT"
        >
          <img
            src={soderblomLogo}
            alt="Soderblom Lab"
            className="header-soderblom-logo"
          />
        </a>
        <span className="header-slash" aria-hidden="true">
          <svg viewBox="0 0 12 36" className="header-slash-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="10" y1="2" x2="2" y2="34" />
          </svg>
        </span>
        <Link
          to="/"
          className="header-pill"
          aria-label="Titan RT Teaching Tool home"
          onMouseEnter={() => {
            setRtExpansionText({ left: 'Radiative', right: 'Transfer' });
            setRtExpanded(true);
          }}
          onMouseLeave={() => setRtExpanded(false)}
        >
          <img
            src="/assets/dt/tomasko_1.0/2012_A0.1_p000_5_2_1.3.png"
            alt=""
            className="header-logo"
          />
          <h1 className="app-title">
            Titan <span className="rt-container">
              <span className="rt-letter-wrapper">
                <span className="rt-letter r-letter">R</span>
                <span className={`rt-expanded-left ${rtExpanded ? 'rt-visible' : ''}`}>
                  {rtExpanded && rtExpansionText.left.substring(1)}
                </span>
              </span>
              <span className="rt-letter-wrapper">
                <span className="rt-letter t-letter">T</span>
                <span className={`rt-expanded-right ${rtExpanded ? 'rt-visible' : ''}`}>
                  {rtExpanded && rtExpansionText.right.substring(1)}
                </span>
              </span>
            </span> <span className={`teaching-tool-text ${rtExpanded ? 'shifted' : ''}`}>Teaching Tool</span>
          </h1>
        </Link>
        <div className="development-notice">
          <div className="development-notice-text">
            <div>Star our</div>
            <div>GitHub repo!</div>
          </div>
        </div>
      </div>
      <div className="header-right">
        <Link to="/user-guide" className="user-guide-link">
          User Guide
        </Link>
        <div className="github-container">
          <a
            href="https://github.com/KentBrought/titan-rt-teaching-tool"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
            aria-label="GitHub Repository"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="github-icon"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}

export default Header;
