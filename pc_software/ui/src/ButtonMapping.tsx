import React, { useEffect, useState } from 'react';
import './ButtonMapping.css';
import type { Mapping, StickConfig } from './types';

interface ButtonMappingProps {
  deviceType: 'L' | 'R';
  initialMapping: Mapping;
  onMappingChange: (mapping: Mapping) => void;
  pressedButtons: { [key: string]: boolean };
  onOpenStickSettings: (stick: 'stick_l' | 'stick_r') => void; // モーダルを開くためのコールバック
}

// ボタンの内部名と表示名のマッピング
const buttonLabels: { [key: string]: string } = {
  arrow_up: '十字キー 上',
  arrow_down: '十字キー 下',
  arrow_left: '十字キー 左',
  arrow_right: '十字キー 右',
  stick_press_l: 'スティック押し込み',
  stick_l: '左スティック',
  l: 'L ボタン',
  zl: 'ZL ボタン',
  sl: 'SL ボタン',
  sr: 'SR ボタン',
  minus: 'マイナスボタン',
  capture: 'キャプチャボタン',
  a: 'A ボタン',
  b: 'B ボタン',
  x: 'X ボタン',
  y: 'Y ボタン',
  stick_press_r: 'スティック押し込み',
  stick_r: '右スティック',
  r: 'R ボタン',
  zr: 'ZR ボタン',
  plus: 'プラスボタン',
  home: 'ホームボタン',
};

const joyConLButtons = [
  'arrow_up', 'arrow_down', 'arrow_left', 'arrow_right',
  'stick_press_l', 'stick_l', 'l', 'zl', 'sl', 'sr', 'minus', 'capture'
];

const joyConRButtons = [
  'a', 'b', 'x', 'y',
  'stick_press_r', 'stick_r', 'r', 'zr', 'sl', 'sr', 'plus', 'home'
];

// スティックのモード
const stickModes = [
  { value: 'none', label: 'なし' },
  { value: 'mouse', label: 'マウスカーソル' },
  { value: '8way', label: '8方向キー' },
  { value: 'dial', label: 'ダイヤル' },
];


// Joy-Conの模式図コンポーネント
export const JoyConDiagram: React.FC<{ type: 'L' | 'R', pressedButtons: { [key: string]: boolean } }> = ({ type, pressedButtons }) => (
  <div className={`joycon-diagram joycon-diagram-${type.toLowerCase()}`}>
    {type === 'L' ? (
      <>
        <div className={`joycon-button l-button ${pressedButtons['l'] ? 'pressed' : ''}`}>L</div>
        <div className={`joycon-button zl-button ${pressedButtons['zl'] ? 'pressed' : ''}`}>ZL</div>
        <div className={`joycon-button sl-button-left ${pressedButtons['sl'] ? 'pressed' : ''}`}>SL</div>
        <div className={`joycon-button sr-button-left ${pressedButtons['sr'] ? 'pressed' : ''}`}>SR</div>
        <div className={`joycon-stick joycon-stick-l ${pressedButtons['stick_press_l'] ? 'pressed' : ''}`}></div>
        <div className={`joycon-button arrow-up ${pressedButtons['arrow_up'] ? 'pressed' : ''}`}>▲</div>
        <div className={`joycon-button arrow-down ${pressedButtons['arrow_down'] ? 'pressed' : ''}`}>▼</div>
        <div className={`joycon-button arrow-left ${pressedButtons['arrow_left'] ? 'pressed' : ''}`}>◀</div>
        <div className={`joycon-button arrow-right ${pressedButtons['arrow_right'] ? 'pressed' : ''}`}>▶</div>
        <div className={`joycon-button minus ${pressedButtons['minus'] ? 'pressed' : ''}`}>-</div>
        <div className={`joycon-button capture ${pressedButtons['capture'] ? 'pressed' : ''}`}>■</div>
      </>
    ) : (
      <>
        <div className={`joycon-button r-button ${pressedButtons['r'] ? 'pressed' : ''}`}>R</div>
        <div className={`joycon-button zr-button ${pressedButtons['zr'] ? 'pressed' : ''}`}>ZR</div>
        <div className={`joycon-button sl-button-right ${pressedButtons['sr'] ? 'pressed' : ''}`}>SR</div>
        <div className={`joycon-button sr-button-right ${pressedButtons['sl'] ? 'pressed' : ''}`}>SL</div>
        <div className={`joycon-stick joycon-stick-r ${pressedButtons['stick_press_r'] ? 'pressed' : ''}`}></div>
        <div className={`joycon-button button-a ${pressedButtons['a'] ? 'pressed' : ''}`}>A</div>
        <div className={`joycon-button button-b ${pressedButtons['b'] ? 'pressed' : ''}`}>B</div>
        <div className={`joycon-button button-x ${pressedButtons['x'] ? 'pressed' : ''}`}>X</div>
        <div className={`joycon-button button-y ${pressedButtons['y'] ? 'pressed' : ''}`}>Y</div>
        <div className={`joycon-button plus ${pressedButtons['plus'] ? 'pressed' : ''}`}>+</div>
        <div className={`joycon-button home ${pressedButtons['home'] ? 'pressed' : ''}`}>⌂</div>
      </>
    )}
  </div>
);

const ButtonMapping: React.FC<ButtonMappingProps> = ({ deviceType, initialMapping, onMappingChange, pressedButtons, onOpenStickSettings }) => {
  const [mapping, setMapping] = useState(initialMapping);

  useEffect(() => {
    setMapping(initialMapping);
  }, [initialMapping]);

  const handleInputChange = (button: string, value: string) => {
    const newMapping = { ...mapping };
    const isStick = button === 'stick_l' || button === 'stick_r';

    if (isStick) {
      const currentConfig = typeof newMapping[button] === 'object' ? newMapping[button] as StickConfig : { mode: 'none' };
      const newMode = value as StickConfig['mode'];

      if (newMode === 'mouse') {
        newMapping[button] = {
          mode: 'mouse',
          sensitivity: currentConfig.sensitivity || 50, // デフォルト感度
        };
      } else if (newMode === '8way') {
        newMapping[button] = {
          mode: '8way',
          mappings: currentConfig.mappings || {},
        };
      } else if (newMode === 'dial') {
        newMapping[button] = {
          mode: 'dial',
          dials: currentConfig.dials || {},
        };
      } else {
        newMapping[button] = { mode: 'none' };
      }
    } else {
      newMapping[button] = value;
    }
    setMapping(newMapping);
    onMappingChange(newMapping);
  };

  const buttons = deviceType === 'L' ? joyConLButtons : joyConRButtons;

  // レンダリングする入力要素を決定する関数
  const renderInputControl = (button: string) => {
    const isStick = button === 'stick_l' || button === 'stick_r';
    const value = mapping[button];

    if (isStick) {
      // valueが文字列の場合（古いデータ形式）、オブジェクトに変換
      const config: StickConfig = typeof value === 'object' ? value as StickConfig : { mode: value || 'none' };
      
      return (
        <div className="stick-control">
          <select
            id={`map-${button}`}
            value={config.mode || 'none'}
            onChange={(e) => handleInputChange(button, e.target.value)}
          >
            {stickModes.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {(config.mode === 'mouse' || config.mode === '8way' || config.mode === 'dial') && (
            <button className="details-button" onClick={() => onOpenStickSettings(button as 'stick_l' | 'stick_r')}>
              詳細設定
            </button>
          )}
        </div>
      );
    }

    return (
      <input
        id={`map-${button}`}
        type="text"
        value={(value as string) || ''}
        onChange={(e) => handleInputChange(button, e.target.value)}
        placeholder="例: a, ctrl_l, space"
      />
    );
  };

  return (
    <div className="button-mapping-layout">
      {deviceType === 'L' ? (
        <>
          <div className="mapping-list-container">
            {buttons.map(button => {
              const isPressed = pressedButtons && pressedButtons[button];
              return (
                <div key={button} className={`mapping-item ${isPressed ? 'pressed' : ''}`}>
                  <label htmlFor={`map-${button}`}>{buttonLabels[button] || button}</label>
                  {renderInputControl(button)}
                </div>
              );
            })}
          </div>
          <div className="diagram-container">
            <JoyConDiagram type={deviceType} pressedButtons={pressedButtons} />
          </div>
        </>
      ) : (
        <>
          <div className="diagram-container">
            <JoyConDiagram type={deviceType} pressedButtons={pressedButtons} />
          </div>
          <div className="mapping-list-container">
            {buttons.map(button => {
              const isPressed = pressedButtons && pressedButtons[button];
              return (
                <div key={button} className={`mapping-item ${isPressed ? 'pressed' : ''}`}>
                  <label htmlFor={`map-${button}`}>{buttonLabels[button] || button}</label>
                  {renderInputControl(button)}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ButtonMapping;
