import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const Layout = () => {
  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      <Sidebar />
      <main className="flex-1 flex flex-col p-4 min-h-screen">
        <div className="glass-panel flex-1 p-6 overflow-y-auto min-h-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
