import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import './Layout.css';

const Layout = () => {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="glass-panel content-wrapper">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
