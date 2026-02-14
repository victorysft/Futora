import React, { useEffect, useState } from "react";

export default function LevelUpOverlay({ level, isVisible, onComplete }) {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShowContent(true);
      const timer = setTimeout(() => {
        onComplete();
        setShowContent(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 bg-black bg-opacity-95 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity duration-400 ${
        showContent ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className={`text-center transform transition-all duration-600 ${
        showContent ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}>
        <h1 className="text-6xl font-black text-white mb-4 tracking-wider uppercase">
          LEVEL UP
        </h1>
        <p className="text-lg text-gray-300 mb-8 font-light tracking-wide">
          You are becoming.
        </p>
        <div className={`text-5xl font-bold text-white transform transition-all duration-800 ${
          showContent ? 'scale-100' : 'scale-95'
        }`}
        style={{
          textShadow: '0 0 20px rgba(59, 130, 246, 0.6), 0 0 40px rgba(59, 130, 246, 0.3)'
        }}>
          Level {level}
        </div>
      </div>
    </div>
  );
}