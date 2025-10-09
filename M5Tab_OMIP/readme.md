# Open-Modular-Input-Protocol

## 仕様 (Open Modular Input Protocol - OMIP)

### プロジェクト基本仕様書 v0.1

#### 1. プロジェクトビジョンとライセンス

##### 1.1 ビジョン
新しいデバイスを次々と作るのではなく、ユーザーが異なるビルドのモジュールを自由に組み合わせ、その人に合ったものを長期間使い続けられるための、汎用的でオープンなエコシステムを構築する。

プロジェクトの核は、ハードウェアではなく、PC制御ソフトウェアと通信プロトコルの制定に置く。

##### 1.2 ターゲットユーザー
キーボードのショートカット以上の高度なシステム連携を求める一般ユーザーおよび、カスタムデバイスを開発したいハードウェアビルダー。

##### 1.3 ライセンス決定
長期的なエコシステムの安定性と、企業や個人の商用利用の促進を目的として、以下のライセンスを採用する。

| 対象 | ライセンス | 目的 |
| :--- | :--- | :--- |
| PC制御ソフトウェア | Apache License 2.0 | 特許報復条項により利用者の心理的障壁を下げ、商用利用を促進する。 |
| プロトコル仕様書 (OMIP) | CC BY-SA 4.0 | 仕様のオープン性を永続的に保証し、派生仕様もオープンに保つ。 |
| ファームウェアテンプレート | Apache License 2.0 | ソフトウェアと同様の理由で、デバイスビルダーの参加を促す。 |

#### 2. 通信アーキテクチャと技術選定

##### 2.1 通信方針
既存のUSB HIDプロトコルは、画像転送や高度なアナログ入力の柔軟性に欠けるため使用しない。独自のPCソフトウェアを必須とし、デバイスとの通信はバイナリ形式の独自プロトコルで行う。

##### 2.2 技術スタック

| 項目 | 技術 | 理由 |
| :--- | :--- | :--- |
| デバイスマイコン | ESP32, M5Stackシリーズ, など | USBシリアル通信（VCP）やBluetooth対応と開発コミュニティの活発さ。 |
| デバイス↔PC間物理接続 | **USBシリアル通信 (VCP) (推奨)** | 独自のデータ転送に最も柔軟性が高く、全機能を利用可能。 |
| | **Bluetooth LE (オプション)** | ボタン入力など簡易的な操作を手軽に無線化するための選択肢。 |
| プロトコル形式 (推奨) | Protocol Buffers (Protobuf) | 極めて高い通信効率と構造化された拡張性により、画像・アナログデータ転送に最適。長期的な仕様変更の保守性も高い。 |
| PC制御ソフトウェア | C# (.NET) / Rust / Python など (要検討) | OSレベルでのコマンド実行、アクティブアプリケーションの監視（コンテキスト認識）能力を重視。 |

##### 2.3 接続方式の使い分け
本プロトコルでは、用途に応じて2種類の接続方式を定義する。

- **USB接続 (推奨):**
  - **特徴:** 低遅延かつ広帯域な通信が可能。PCからの給電もできる。
  - **用途:** 全機能（高頻度なアナログ入力、画像転送など）を利用する場合の標準的な接続方式。

- **Bluetooth LE接続 (オプション):**
  - **特徴:** 無線による利便性を提供するが、通信性能には制限がある。デバイス側には別途電源が必要。
  - **用途:** ボタン入力 (`INPUT_DIGITAL`) やエンコーダー (`INPUT_ENCODER`) など、データ量が少なく、リアルタイム性が最重要ではない簡易的な操作に限定。
  - **制限事項:** 原則として、画像転送 (`FEEDBACK_IMAGE`) のような大容量データの通信はサポート対象外とする。

#### 3. Open Modular Input Protocol (OMIP) 仕様の核

##### 3.1 デバイス間通信 (I2C Bus)
異なるビルダーのモジュールを組み合わせるモジュラー性を実現するため、デバイス間の通信にはI2Cを採用する。

- **役割:** PCと接続される「マスターハブ」がI2Cバスを制御し、接続された「サブデバイス」の**能力（Capability）**を列挙し、設定を一元管理する。
- **初期列挙 (Enumeration):** サブデバイスは接続時、マスターハブからの要求に応じ、自身のI/Oポート定義（ボタン数、ダイヤル軸、画面解像度など）をProtobufメッセージとして返答する。

##### 3.2 コミュニケーションメッセージタイプ (Protobuf定義)
すべてのメッセージは、共通のバイナリフレーム（ヘッダー/フッター）でカプセル化される。

###### 3.2.1 デバイス → PC (入力データ)

| メッセージタイプ | 目的 | データ構造の要点 |
| :--- | :--- | :--- |
| `INPUT_DIGITAL` | ボタン/トグルスイッチのデジタル入力 | デバイスID、ポートID、状態 (ON/OFF) |
| `INPUT_ANALOG` | スライダー/ジョイスティックなどの連続値 | デバイスID、ポートID、正規化された値 (0.00〜1.00) |
| `INPUT_ENCODER` | ロータリーエンコーダの回転 | デバイスID、ポートID、回転方向、ステップ数 |

###### 3.2.2 PC → デバイス (フィードバック・制御)

| メッセージタイプ | 目的 | データ構造の要点 |
| :--- | :--- | :--- |
| `FEEDBACK_IMAGE` | ストリームデック風の画面表示更新 | デバイスID、画面ID、画像形式 (例: RLE圧縮)、圧縮された画像バイナリ |
| `FEEDBACK_LED` | LEDの色やパターンの制御 | デバイスID、LED ID、カラーコード (RGB)、点灯パターン |
| `SYSTEM_CONFIG` | デバイスへの設定情報の書き込み/読出し | ファームウェア更新、I2Cアドレス設定など |

#### 4. 最初のマイルストーン (MVP)
プロジェクト初期の目標は、プロトコルの実証と低遅延なコア機能の確立とする。

- **リファレンスデバイスの作成:** ESP32をベースとした、4つのデジタルボタンと1つのアナログダイヤルを持つシンプルなモジュールを作成する。
- **コアプロトコルの実装:** `INPUT_DIGITAL`と`INPUT_ANALOG`メッセージの送受信およびProtobufによるバイナリ変換を完成させる。
- **PC制御ソフトウェア (Windows/macOS):** 接続したデバイスの入力を受け取り、アクティブなアプリケーションに応じて任意のキーボードコマンドを実行できる最小限の制御エンジンを実装する。
- **低遅延の証明:** アナログ入力からPC側でのコマンド実行までの遅延が既存HIDデバイスよりも低いことを実証する。

### 5. プロトコル詳細定義 (`omip.proto`)
PCとデバイス間の通信データは、以下のProtobufスキーマに基づいてシリアライズされる。

```protobuf
syntax = "proto3";

package omip;

// ラッパーメッセージ: すべてのメッセージはこのラッパーに含まれて送信される
message WrapperMessage {
  oneof message_type {
    InputDigital input_digital = 1;
    InputAnalog input_analog = 2;
    InputEncoder input_encoder = 3;
    FeedbackImage feedback_image = 4;
    FeedbackLed feedback_led = 5;
    SystemConfig system_config = 6;
    DeviceCapabilityRequest capability_request = 7;
    DeviceCapabilityResponse capability_response = 8;
  }
}

// 1. デバイス → PC (入力データ)
message InputDigital {
  uint32 device_id = 1;
  uint32 port_id = 2;
  bool state = 3; // ON or OFF
}

message InputAnalog {
  uint32 device_id = 1;
  uint32 port_id = 2;
  float value = 3; // 0.00 to 1.00
}

message InputEncoder {
  uint32 device_id = 1;
  uint32 port_id = 2;
  sint32 steps = 3; // 正: 時計回り, 負: 反時計回り
}

// 2. PC → デバイス (フィードバック・制御)
message FeedbackImage {
  uint32 device_id = 1;
  uint32 screen_id = 2;
  enum ImageFormat {
    RGB565_RLE = 0; // RLE圧縮されたRGB565
    JPEG = 1;
  }
  ImageFormat format = 3;
  bytes image_data = 4;
}

message FeedbackLed {
  uint32 device_id = 1;
  uint32 led_id = 2;
  uint32 color_rgb = 3; // 24-bit RGB (0xRRGGBB)
}

message SystemConfig {
  // (将来的な拡張のためのプレースホルダ)
  // 例: ファームウェア更新命令など
}

// 3. デバイス能力定義
message DeviceCapabilityRequest {
  // マスターハブからサブデバイスへ能力を問い合わせる
}

message DeviceCapabilityResponse {
  uint32 device_id = 1;
  repeated PortDescription ports = 2;

  message PortDescription {
    enum PortType {
      DIGITAL_INPUT = 0;
      ANALOG_INPUT = 1;
      ENCODER_INPUT = 2;
      IMAGE_OUTPUT = 3;
      LED_OUTPUT = 4;
    }
    PortType type = 1;
    uint32 port_id = 2;
    // 将来的な拡張: 解像度、感度など
  }
}
```

### 6. I2C通信規約 (マスターハブ ↔ サブデバイス)
マスターハブは、接続されたサブデバイスを管理するために以下のI2Cコマンドを使用する。

| コマンド (1Byte) | 説明 | 送信データ | 受信データ |
| :--- | :--- | :--- | :--- |
| `0x01` | `GET_CAPABILITIES` | なし | `DeviceCapabilityResponse`のProtobufシリアライズデータ |
| `0x10` | `READ_INPUT_EVENT` | なし | `WrapperMessage`のProtobufシリアライズデータ (入力イベントを含む) |
| `0x20` | `WRITE_OUTPUT_DATA` | `WrapperMessage`のProtobufシリアライズデータ (フィードバックデータを含む) | なし |

- **アドレス:** サブデバイスは7-bit I2Cアドレスを持つ。アドレスの衝突を避けるための機構は将来的に定義する (例: DIPスイッチ、ソフトウェア設定)。
- **通信フロー:** 
    1. マスターハブは起動時、I2Cバスをスキャンしてサブデバイスを検出する。
    2. 検出した各サブデバイスに対し、`GET_CAPABILITIES`コマンドを送信する。
    3. サブデバイスは自身の能力を`DeviceCapabilityResponse`として返す。
    4. マスターハブは、定期的に各サブデバイスに`READ_INPUT_EVENT`を送信し、入力状態をポーリングする。

### 7. MVPの技術スタック
最初のマイルストーン（MVP）を迅速に開発するため、以下の技術スタックを選定する。

- **PC制御ソフトウェア:** 
    - **言語:** Python 3.9+
    - **主要ライブラリ:** 
        - `pyserial`: USBシリアル通信用。
        - `protobuf`: プロトコルデータのシリアライズ/デシリアライズ用。
        - `pynput`: OSレベルのキーボード/マウス操作用。
- **ファームウェア (ESP32):** 
    - **フレームワーク:** Arduino
    - **主要ライブラリ:** 
        - `Arduino-esp32`: ESP32コアライブラリ。
        - `nanopb`: C言語ベースのProtobuf実装。

### 8. ディレクトリ構造
プロジェクトのソースコードやドキュメントは、以下の構造で管理する。

```
.
├── README.md
├── docs/               # (将来的に) 詳細ドキュメント
├── firmware/           # ファームウェアのソースコード
│   ├── master_hub/     # マスターハブ用
│   └── sub_device/     # サブデバイス用
├── pc_software/        # PC制御ソフトウェアのソースコード
└── proto/              # Protobufスキーマ定義 (.protoファイル)
```

### 9. PCソフトウェア開発環境とビルド手順

#### 9.1 フロントエンド (Vite + Electron)
- `pc_software/ui` フロントエンドのビルドには Node.js 18 以上が必須です。開発環境が WSL などで古い Node.js を参照している場合は、`npm run build` が `scripts/build.cjs` を介して Windows 側の `node.exe` (例: `C:\Program Files\nodejs\node.exe`) を自動選択します。
- `scripts/build.cjs` は `tsc -b` → `vite build` → `electron-builder` の順に起動し、フロントエンドと Electron パッケージをまとめて生成します。個別にコマンドを実行する必要はありません。
- Electron パッケージャーの設定では `win.signAndEditExecutable = false` としており、Windows でのシンボリックリンク作成やコードサイニングを強制しません。必要に応じて署名処理を行いたい場合は `package.json` の設定を調整してください。

#### 9.2 バックエンド (Python)
このプロジェクトのPythonスクリプトは、`pc_software`ディレクトリ内の`venv`という名前の仮想環境で実行します。
環境のセットアップと依存関係のインストールは、以下のコマンドで行ってください。

**Windows:**
```shell
python -m venv pc_software\venv
pc_software\venv\Scripts\activate
pip install -r pc_software\requirements.txt
```

**macOS / Linux:**
```shell
python3 -m venv pc_software/venv
source pc_software/venv/bin/activate
pip install -r pc_software/requirements.txt
```

### 10. 応用例 (Application Examples)

#### 10.1 M5Tab Stream Deck
M5Stack社の `M5Tab` を利用して、多機能な左手デバイス（Stream Deckのようなデバイス）を構築する。

- **画面:** `M5Tab` のタッチスクリーンを活用し、アプリケーションごとに動的なアイコンを表示する。
- **入力:** タッチ操作でコマンドを実行する。
- **通信:** USBシリアルまたはBluetooth経由でPCと連携する。

##### M5Tab版 詳細仕様
- **UIレイアウト:**
    - **ヘッダーエリア:** 画面上部に、M5Tab本体のボリュームと画面輝度を調整するためのアイコンを配置する。
    - **メインエリア:** 3x6のグリッド状に配置されたアイコンを表示し、それぞれにショートカットを割り当てる。
    - **サイドバー:** 画面の縦一列（左端または右端）をボリューム調整用のスライダーとして使用する。
- **操作:**
    - **デバイス設定:** ヘッダーエリアのアイコンをタップして、ボリュームや輝度の設定UI（例: スライダー）を呼び出し、調整する。
    - **ショートカット実行:** 各アイコンをタップする。
    - **ページ切り替え:** 画面のメインエリアを左右にスワイプすることで、アイコンのページを切り替える。
    - **ボリューム調整:** サイドバーエリアを上下にスライドする。
- **通信:**
    - **接続方式:** USBシリアル接続を基本とする。
- **アイコン管理:** 
    - アイコンの画像はPCソフトウェア側で管理し、ページ切り替えやアプリケーションの変更に応じて、必要な画像を都度M5Tabに転送する。