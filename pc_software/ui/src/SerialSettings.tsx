import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';

interface Port {
  device: string;
  description: string;
}

interface SerialSettingsProps {
  socket: Socket;
}

const PortSelector: React.FC<{
  ports: Port[];
  selectedPort: string;
  onPortChange: (port: string) => void;
  onRefresh: () => void;
}> = ({ ports, selectedPort, onPortChange, onRefresh }) => (
  <div className="form-group">
    <label htmlFor="port-select">Available Ports:</label>
    <div className="port-selector-row">
      <select id="port-select" value={selectedPort} onChange={(e) => onPortChange(e.target.value)} disabled={ports.length === 0}>
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
      <button onClick={onRefresh} className="button-outline">Refresh</button>
    </div>
  </div>
);

const ConnectionManager: React.FC<{
  selectedPort: string;
  status: string;
  onConnect: () => void;
}> = ({ selectedPort, status, onConnect }) => {
    const getStatusClass = () => {
        if (status.startsWith('Connected')) return 'status-connected';
        if (status.startsWith('Error')) return 'status-error';
        return 'status-disconnected';
    };

    return (
        <>
            <button onClick={onConnect} disabled={!selectedPort} className="button-primary">Connect</button>
            <div className={`status ${getStatusClass()}`}>
                <p><strong>Status:</strong> {status}</p>
            </div>
        </>
    );
};

const SerialSettings: React.FC<SerialSettingsProps> = ({ socket }) => {
  const [ports, setPorts] = useState<Port[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [status, setStatus] = useState('Awaiting selection...');

  useEffect(() => {
    // Request the port list on component mount
    socket.emit('get_serial_ports');

    const handleSerialPorts = (portList: Port[]) => {
      setPorts(portList);
      if (portList.length > 0 && !selectedPort) {
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
  }, [socket, selectedPort]);

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
    <>
      <h2>Serial Port Settings</h2>
      <PortSelector
        ports={ports}
        selectedPort={selectedPort}
        onPortChange={setSelectedPort}
        onRefresh={handleRefresh}
      />
      <ConnectionManager
        selectedPort={selectedPort}
        status={status}
        onConnect={handleConnect}
      />
    </>
  );
};

export default SerialSettings;
