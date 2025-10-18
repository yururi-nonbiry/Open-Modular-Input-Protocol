// スティック設定の型定義
export interface StickConfig {
  mode: 'none' | 'mouse';
  sensitivity?: number;
}

// マッピング全体の型定義
export type Mapping = { [key: string]: string | StickConfig };

// Joy-Conデバイスの型定義
export interface JoyConDevice {
  id: string;
  type: 'L' | 'R';
  battery: number;
  buttons?: { [key: string]: boolean };
}
