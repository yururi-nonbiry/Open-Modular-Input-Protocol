import React from 'react';

interface ButtonMappingProps {
  deviceType: 'L' | 'R'; // Joy-Con L or R
}

const ButtonMapping: React.FC<ButtonMappingProps> = ({ deviceType }) => {
  return (
    <div className="button-mapping-container">
      <h3>{`Joy-Con (${deviceType}) Button Mapping`}</h3>
      <p>ここにボタン割り当ての設定UIを実装します。</p>
      {/* 今後、ここにJoy-Conの画像や各ボタンの設定項目を追加します */}
    </div>
  );
};

export default ButtonMapping;
