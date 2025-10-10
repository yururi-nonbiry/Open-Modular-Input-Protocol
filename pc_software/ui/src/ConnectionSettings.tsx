import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';

// --- TYPE DEFINITIONS ---
interface Port {
  device: string;
  description: string;
}

interface BleDevice {
    name: string;
    address: string;
}

interface ConnectionSettingsProps {
  socket: Socket;
  bleDevices: BleDevice[];
}

type ConnectionType = 'USB' | 'BLE';

// --- SUB-COMPONENTS ---
const ConnectionTypeSelector: React.FC<{ 
    type: ConnectionType, 
    setType: (type: ConnectionType) => void 
}> = ({ type, setType }) => (
    <div className="form-group">
        <label>Connection Type</label>
        <div className="radio-group">
            <label><input type="radio" value="USB" checked={type === 'USB'} onChange={() => setType('USB')} /> USB</label>
            <label><input type="radio" value="BLE" checked={type === 'BLE'} onChange={() => setType('BLE')} /> Bluetooth LE</label>
        </div>
    </div>
);

const UsbConnector: React.FC<{ 
    socket: Socket, 
    ports: Port[], 
    selectedPort: string, 
    setSelectedPort: (p: string) => void,
    status: string,
    setStatus: (s: string) => void
}> = ({ socket, ports, selectedPort, setSelectedPort, status, setStatus }) => {
    
    useEffect(() => {
        socket.emit('get_serial_ports');
        const handleSerialPorts = (portList: Port[]) => {
            if (portList.length > 0 && !selectedPort) setSelectedPort(portList[0].device);
        };
        socket.on('serial_ports', handleSerialPorts);
        return () => { socket.off('serial_ports', handleSerialPorts); };
    }, [socket, selectedPort, setSelectedPort]);

    const handleConnect = () => {
        if (selectedPort) {
            setStatus(`Connecting to ${selectedPort}...`);
            socket.emit('select_serial_port', selectedPort);
        }
    };

    return (
        <>
            <div className="form-group">
                <label htmlFor="port-select">Available Ports:</label>
                <select id="port-select" value={selectedPort} onChange={(e) => setSelectedPort(e.target.value)} disabled={ports.length === 0}>
                    {ports.length > 0 ? ports.map(p => <option key={p.device} value={p.device}>{p.device} - {p.description}</option>) : <option disabled>No ports found</option>}
                </select>
            </div>
            <button onClick={handleConnect} disabled={!selectedPort} className="button-primary">Connect</button>
        </>
    );
};

const BleConnector: React.FC<{ 
    bleDevices: BleDevice[],
    selectedDevice: string,
    setSelectedDevice: (d: string) => void,
    onConnect: () => void
}> = ({ bleDevices, selectedDevice, setSelectedDevice, onConnect }) => (
    <>
        <div className="form-group">
            <label htmlFor="ble-select">Scanned Devices:</label>
            <select id="ble-select" value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} disabled={bleDevices.length === 0}>
                 {bleDevices.length > 0 ? bleDevices.map(d => <option key={d.address} value={d.address}>{d.name} ({d.address})</option>) : <option disabled>No devices found</option>}
            </select>
        </div>
        <button onClick={onConnect} disabled={!selectedDevice} className="button-primary">Connect</button>
    </>
);

// --- MAIN COMPONENT ---
const ConnectionSettings: React.FC<ConnectionSettingsProps> = ({ socket, bleDevices }) => {
  const [connectionType, setConnectionType] = useState<ConnectionType>('USB');
  const [ports, setPorts] = useState<Port[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [selectedBleDevice, setSelectedBleDevice] = useState<string>('');
  const [status, setStatus] = useState('Awaiting selection...');

  useEffect(() => {
    const handleSerialPorts = (portList: Port[]) => setPorts(portList);
    const handleConnectionStatus = (data: { status: string; port?: string; message?: string }) => {
        if (data.status === 'connected') setStatus(`Connected to ${data.port}`);
        else if (data.status === 'disconnected') setStatus('Disconnected');
        else if (data.status === 'error') setStatus(`Error: ${data.message}`);
    };

    socket.on('serial_ports', handleSerialPorts);
    socket.on('connection_status', handleConnectionStatus);

    return () => {
      socket.off('serial_ports', handleSerialPorts);
      socket.off('connection_status', handleConnectionStatus);
    };
  }, [socket]);

  const handleBleConnect = () => {
      if (selectedBleDevice) {
          setStatus(`Connecting to ${selectedBleDevice}...`);
          socket.emit('select_ble_device', selectedBleDevice);
      }
  };

  return (
    <>
      <h2>Connection Settings</h2>
      <ConnectionTypeSelector type={connectionType} setType={setConnectionType} />
      <hr />
      {connectionType === 'USB' ? (
          <UsbConnector socket={socket} ports={ports} selectedPort={selectedPort} setSelectedPort={setSelectedPort} status={status} setStatus={setStatus} />
      ) : (
          <BleConnector bleDevices={bleDevices} selectedDevice={selectedBleDevice} setSelectedDevice={setSelectedBleDevice} onConnect={handleBleConnect} />
      )}
      <div className={`status ${status.startsWith('Connected') ? 'status-connected' : status.startsWith('Error') ? 'status-error' : 'status-disconnected'}`}>
          <p><strong>Status:</strong> {status}</p>
      </div>
    </>
  );
};

export default ConnectionSettings;
