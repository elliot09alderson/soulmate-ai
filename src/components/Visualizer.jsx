import React from 'react';
import './Visualizer.css';

const Visualizer = ({ active }) => {
  // Simple CSS animation for visualizer
  return (
    <div className={`visualizer ${active ? 'active' : ''}`}>
      <div className="bar"></div>
      <div className="bar"></div>
      <div className="bar"></div>
      <div className="bar"></div>
      <div className="bar"></div>
    </div>
  );
};

export default Visualizer;
