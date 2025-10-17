import React, { useEffect, useState } from 'react';
import './ButtonMapping.css';

interface ButtonMappingProps {
  deviceType: 'L' | 'R';
  initialMapping: { [key: string]: string };
  onMappingChange: (mapping: { [key: string]: string }) => void;
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
const JoyConDiagram: React.FC<{ type: 'L' | 'R' }> = ({ type }) => (
  <div className={`joycon-diagram joycon-diagram-${type.toLowerCase()}`}>
    {/* ここにCSSで描画したボタンを配置することも可能 */}
  </div>
);

const ButtonMapping: React.FC<ButtonMappingProps> = ({ deviceType, initialMapping, onMappingChange }) => {
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
      <div className="diagram-container">
        <JoyConDiagram type={deviceType} />
      </div>
      <div className="mapping-list-container">
        {buttons.map(button => (
          <div key={button} className="mapping-item">
            <label htmlFor={`map-${button}`}>{buttonLabels[button] || button}</label>
            <input
              id={`map-${button}`}
              type="text"
              value={mapping[button] || ''}
              onChange={(e) => handleInputChange(button, e.target.value)}
              placeholder="例: a, ctrl_l, space"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ButtonMapping;
