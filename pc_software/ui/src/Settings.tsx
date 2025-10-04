import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';

interface Port {
  device: string;
  description: string;
}

interface SettingsProps {
  socket: Socket;
}

const Settings: React.FC<SettingsProps> = ({ socket }) => {
  const [ports, setPorts] = useState<Port[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [status, setStatus] = useState('Awaiting selection...');

  useEffect(() => {
    // Request the port list on component mount
    socket.emit('get_serial_ports');

    const handleSerialPorts = (portList: Port[]) => {
      setPorts(portList);
      if (portList.length > 0) {
        setSelectedPort(portList[0].device);
      }
    };

    const handleConnectionStatus = (data: { status: string; port?: string; message?: string }) => {
        if (data.status === 'connected') {
            setStatus(`Connected to ${data.port}`);
        } else if (data.status === 'disconnected') {
            setStatus('Disconnected');
        } else if (data.status === 'error') {
            setStatus(`Error: ${data.message}`);
        }
    };

    socket.on('serial_ports', handleSerialPorts);
    socket.on('connection_status', handleConnectionStatus);

    return () => {
      socket.off('serial_ports', handleSerialPorts);
      socket.off('connection_status', handleConnectionStatus);
    };
  }, [socket]);

  const handleRefresh = () => {
    socket.emit('get_serial_ports');
  };

  const handleConnect = () => {
    if (selectedPort) {
      setStatus(`Connecting to ${selectedPort}...`);
      socket.emit('select_serial_port', selectedPort);
    }
  };

  return (
    <div className="card">
      <h2>Serial Port Settings</h2>
      <div className="form-group">
        <label htmlFor="port-select">Available Ports:</label>
        <select id="port-select" value={selectedPort} onChange={(e) => setSelectedPort(e.target.value)}>
          {ports.length > 0 ? (
            ports.map((port) => (
              <option key={port.device} value={port.device}>
                {port.device} - {port.description}
              </option>
            ))
          ) : (
            <option value="" disabled>No ports found</option>
          )}
        </select>
        <button onClick={handleRefresh} style={{ marginLeft: '10px' }}>Refresh</button>
      </div>
      <button onClick={handleConnect} disabled={!selectedPort}>Connect</button>
      <div className="status">
        <p><strong>Status:</strong> {status}</p>
      </div>
    </div>
  );
};

export default Settings;
