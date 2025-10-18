import React, { useEffect, useState } from 'react';
import './ButtonMapping.css';

interface ButtonMappingProps {
  deviceType: 'L' | 'R';
  initialMapping: { [key: string]: string };
  onMappingChange: (mapping: { [key: string]: string }) => void;
  pressedButtons: { [key: string]: boolean };
}

// ボタンの内部名と表示名のマッピング
const buttonLabels: { [key: string]: string } = {
  arrow_up: '十字キー 上',
  arrow_down: '十字キー 下',
  arrow_left: '十字キー 左',
  arrow_right: '十字キー 右',
  stick_press_l: 'スティック押し込み',
  l: 'L ボタン',
  zl: 'ZL ボタン',
  sl: 'SL ボタン',
  sr: 'SR ボタン',
  minus: 'マイナスボタン',
  capture: 'キャプチャボタン', // 追加
  a: 'A ボタン',
  b: 'B ボタン',
  x: 'X ボタン',
  y: 'Y ボタン',
  stick_press_r: 'スティック押し込み',
  r: 'R ボタン',
  zr: 'ZR ボタン',
  plus: 'プラスボタン',
  home: 'ホームボタン',
};

const joyConLButtons = [
  'arrow_up', 'arrow_down', 'arrow_left', 'arrow_right',
  'stick_press_l', 'l', 'zl', 'sl', 'sr', 'minus', 'capture' // 追加
];

const joyConRButtons = [
  'a', 'b', 'x', 'y',
  'stick_press_r', 'r', 'zr', 'sl', 'sr', 'plus', 'home'
];

// Joy-Conの模式図コンポーネント
const JoyConDiagram: React.FC<{ type: 'L' | 'R', pressedButtons: { [key: string]: boolean } }> = ({ type, pressedButtons }) => (
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
        <div className={`joycon-button capture ${pressedButtons['capture'] ? 'pressed' : ''}`}>●</div>
      </>
    ) : (
      <>
        <div className={`joycon-button r-button ${pressedButtons['r'] ? 'pressed' : ''}`}>R</div>
        <div className={`joycon-button zr-button ${pressedButtons['zr'] ? 'pressed' : ''}`}>ZR</div>
        <div className={`joycon-button sl-button-right ${pressedButtons['sl'] ? 'pressed' : ''}`}>SL</div>
        <div className={`joycon-button sr-button-right ${pressedButtons['sr'] ? 'pressed' : ''}`}>SR</div>
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

const ButtonMapping: React.FC<ButtonMappingProps> = ({ deviceType, initialMapping, onMappingChange, pressedButtons }) => {
  const [mapping, setMapping] = useState(initialMapping);

  useEffect(() => {
    setMapping(initialMapping);
  }, [initialMapping]);

  const handleInputChange = (button: string, value: string) => {
    const newMapping = { ...mapping, [button]: value };
    setMapping(newMapping);
    onMappingChange(newMapping);
  };

  const buttons = deviceType === 'L' ? joyConLButtons : joyConRButtons;

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
                  <input
                    id={`map-${button}`}
                    type="text"
                    value={mapping[button] || ''}
                    onChange={(e) => handleInputChange(button, e.target.value)}
                    placeholder="例: a, ctrl_l, space"
                  />
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
                  <input
                    id={`map-${button}`}
                    type="text"
                    value={mapping[button] || ''}
                    onChange={(e) => handleInputChange(button, e.target.value)}
                    placeholder="例: a, ctrl_l, space"
                  />
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
