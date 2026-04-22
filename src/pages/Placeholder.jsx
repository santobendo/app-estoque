import React from 'react';

const Placeholder = ({ title }) => {
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
      <h1 style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}>{title}</h1>
      <p>Página em construção...</p>
    </div>
  );
};

export default Placeholder;
