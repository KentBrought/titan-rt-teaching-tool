import React from 'react';
import '../App.css';

const FOOTER_LINKS = [
  { label: 'Accessibility', href: 'https://accessibility.mit.edu/', ariaLabel: 'MIT Accessibility' },
  { label: 'Soderblom Lab', href: 'https://soderblomlab.mit.edu/', ariaLabel: 'Soderblom Lab at MIT' },
  { label: 'MIT', href: 'https://web.mit.edu', ariaLabel: 'MIT' },
  { label: 'GitHub', href: 'https://github.com/KentBrought/titan-rt-teaching-tool', ariaLabel: 'GitHub Repository' },
  { label: 'NASA Dragonfly', href: 'https://science.nasa.gov/mission/dragonfly/', ariaLabel: 'NASA Dragonfly mission' },
  { label: 'Spectral Sciences, Inc.', href: 'https://www.spectral.com/', ariaLabel: 'Spectral Sciences, Inc. website' },
];

function Footer() {
  return (
    <footer className="app-footer">
      <nav className="footer-nav" aria-label="Footer links">
        {FOOTER_LINKS.map(({ label, href, ariaLabel }, index) => (
          <React.Fragment key={label}>
            {index > 0 && <span className="footer-sep" aria-hidden="true">·</span>}
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
              aria-label={ariaLabel}
            >
              {label}
            </a>
          </React.Fragment>
        ))}
      </nav>
    </footer>
  );
}

export default Footer;
