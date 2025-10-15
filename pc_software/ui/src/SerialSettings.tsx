import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { socket } from './socket';

const SerialSettings = () => {
  const { t } = useTranslation();
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectedPort, setConnectedPort] = useState<string>('');

  const refreshPorts = useCallback(() => {
    socket.emit('list-serial-ports');
  }, []);

  useEffect(() => {
    refreshPorts();

    socket.on('serial-ports-list', (portList) => {
      setPorts(portList);
      if (portList.length > 0 && !selectedPort) {
        setSelectedPort(portList[0]);
      }
    });

    socket.on('serial-connection-status', ({ status, port }) => {
      setIsConnected(status);
      setConnectedPort(port || '');
    });

    // Check initial status on component mount
    socket.emit('get-serial-connection-status');

    return () => {
      socket.off('serial-ports-list');
      socket.off('serial-connection-status');
    };
  }, [refreshPorts, selectedPort]);

  const handleConnect = () => {
    if (selectedPort) {
      socket.emit('connect-serial', { port: selectedPort });
    }
  };

  const handleDisconnect = () => {
    socket.emit('disconnect-serial');
  };

  return (
    <div className="settings-subsection">
      <h4>{t('serialPortSettings')}</h4>
      <div className="setting-item">
        <label htmlFor="serial-port-select">{t('availablePorts')}:</label>
        <div className="port-selection">
          <select 
            id="serial-port-select" 
            value={selectedPort} 
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={isConnected}
          >
            {ports.length > 0 ? (
              ports.map(port => <option key={port} value={port}>{port}</option>)
            ) : (
              <option value="">{t('noPortsFound')}</option>
            )}
          </select>
          <button onClick={refreshPorts} disabled={isConnected}>{t('refresh')}</button>
        </div>
      </div>
      <div className="setting-item">
        <button onClick={handleConnect} disabled={!selectedPort || isConnected}>{t('connect')}</button>
        <button onClick={handleDisconnect} disabled={!isConnected}>{t('disconnect')}</button>
        <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? t('connectedTo', { port: connectedPort }) : t('notConnected')}
        </span>
      </div>
    </div>
  );
};

export default SerialSettings;