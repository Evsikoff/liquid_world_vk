import React from 'react';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Загрузка...' }) => {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-icon">
          <svg
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="loading-vessel"
          >
            {/* Vessel outline */}
            <path
              d="M16 12 L16 52 Q16 58 24 58 L40 58 Q48 58 48 52 L48 12"
              stroke="#94a3b8"
              strokeWidth="3"
              fill="rgba(241, 245, 249, 0.5)"
              strokeLinecap="round"
            />
            {/* Animated liquid */}
            <rect
              x="17.5"
              y="24"
              width="29"
              height="32"
              rx="6"
              className="loading-liquid"
            />
            {/* Vessel rim */}
            <path
              d="M12 12 L52 12"
              stroke="#64748b"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="loading-text">{message}</p>
        <div className="loading-dots">
          <span className="loading-dot"></span>
          <span className="loading-dot"></span>
          <span className="loading-dot"></span>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
