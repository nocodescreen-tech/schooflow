import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ToastContainer from './Toast';
import WebSocketProvider from './WebSocketProvider';
import { useSettingsStore } from '../store/settingsStore';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const hydrated = useSettingsStore((s) => s.hydrated);

  // Load the real school data once, so every page reads DB values.
  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  return (
    <WebSocketProvider>
      <div className="min-h-screen bg-background dark:bg-dark">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="lg:pl-[280px]">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="p-4 lg:p-6">
            <AnimatePresence mode="wait">
              <Outlet />
            </AnimatePresence>
          </main>
        </div>
        <ToastContainer />
      </div>
    </WebSocketProvider>
  );
}