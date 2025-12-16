import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Check if it's a memory error
    const errorMessage = error?.message || String(error);
    if (errorMessage.toLowerCase().includes('memory') || 
        errorMessage.toLowerCase().includes('out of')) {
      this.setState({ 
        hasError: true, 
        error: { ...error, isMemoryError: true } 
      });
    }
  }

  render() {
    if (this.state.hasError) {
      const isMemoryError = this.state.error?.isMemoryError || 
                           this.state.error?.message?.toLowerCase().includes('memory') ||
                           this.state.error?.message?.toLowerCase().includes('out of');
      
      return (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center',
          backgroundColor: '#f8d7da',
          borderRadius: '8px',
          margin: '10px',
          border: '1px solid #f5c6cb'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '15px' }}>⚠️</div>
          <h3 style={{ color: '#721c24', marginBottom: '10px' }}>
            {isMemoryError ? 'Memory Error' : 'Error'}
          </h3>
          <p style={{ color: '#721c24', marginBottom: '15px' }}>
            {isMemoryError 
              ? 'The application ran out of memory while processing the spectral data. Please try refreshing the page or selecting fewer data points.'
              : this.state.error?.message || 'An error occurred'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;



