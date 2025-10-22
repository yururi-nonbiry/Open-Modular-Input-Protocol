# Open Modular Input Protocol (OMIP)

日本語 | [English](README.en.md)

## 概要

Open Modular Input Protocol (OMIP) は、自作の物理入力デバイス（ボタン、スライダー、エンコーダーなど）とPCアプリケーションを連携させるための、オープンな通信プロトコルおよびフレームワークです。

[Protocol Buffers](https://protobuf.dev/) を利用してプロトコルを定義することで、C++で書かれたデバイスのファームウェアと、PythonやTypeScriptで書かれたPCアプリケーション間での、型安全で効率的な通信を可能にします。

このリポジトリには、OMIPの仕様定義に加えて、具体的な実装例や関連ツールが含まれています。

### 主なコンポーネント

*   **Open Modular Input Protocol (OMIP)**
    *   プロトコルの仕様を定義した `.proto` ファイルです。デバイスからの入力（Input）と、PCからデバイスへのフィードバック（Feedback）に関するメッセージを定義しています。
*   **M5Tab OMIP 実装 (`M5Tab_OMIP/`)**
    *   M5Stack社の `M5Tab` を、タッチスクリーン付きの多機能入力デバイス（ストリームデッキのようなもの）として活用するための総合的なプロジェクトです。
    *   **Firmware:** M5Tab上で動作し、タッチ入力をOMIPメッセージとして送信します。
    *   **PC Software:** PC上で動作するバックエンドとUI。デバイスからの入力を受け取ってPCのキー操作に変換したり、UIからアイコン画像をデバイスに送信したりします。
*   **Joy-Con PC ユーティリティ (`pc_software/`)**
    *   Nintendo SwitchのJoy-ConをPCに接続し、キーボードやマウスとして使用するためのユーティリティです。
    *   **注:** このツールはOMIPとは直接関係なく、独立して動作します。
*   **シンプルハブ実装例 (`firmware/master_hub/`)**
    *   基本的なボタンとアナログ入力を持つ、最小構成のOMIPデバイスのファームウェア実装例です。

---

## アーキテクチャ

OMIPの基本的なコンセプトは、デバイスとPC間の役割を明確に分離することです。

```
┌──────────────────┐      シリアル通信      ┌──────────────────┐      標準入出力/WebSocket      ┌────────────────┐
│                  │     (OMIPプロトコル)    │                  │         (JSON)             │                │
│  デバイス (C++)   ├───────────────────►  PCバックエンド (Python)  ├────────────────────────►   UI (TypeScript)  │
│ (M5Tab, etc.)    │                      │                  │                            │ (Electron/Vue) │
│                  │◄───────────────────┤ (backend.py)     │◄────────────────────────┤                │
└──────────────────┘                      └──────────────────┘                            └────────────────┘
```

1.  **デバイス (Firmware):**
    *   ボタンが押された、エンコーダーが回された等の物理イベントを検知します。
    *   イベントを `InputDigital` や `InputAnalog` などのOMIPメッセージに変換（エンコード）します。
    *   エンコードされたデータをシリアルポート経由でPCに送信します。
    *   PCから `FeedbackImage` などのメッセージを受信し、画面の表示を更新します。
2.  **PCバックエンド (Backend):**
    *   シリアルポートを監視し、OMIPメッセージを受信・解釈（デコード）します。
    *   受信した入力に基づき、`pynput` などのライブラリを使ってPCのキーボードやマウスを操作します。
    *   UIからの指示を受け、アイコン画像などをOMIPメッセージとしてデバイスに送信します。
    *   標準入出力（stdin/stdout）やWebSocketを介してUIとJSON形式で通信します。
3.  **UI (Frontend):**
    *   デバイスの設定（どのボタンにどのキーを割り当てるかなど）を行うためのグラフィカルなインターフェースを提供します。
    *   設定情報をバックエンドに送信します。

---

## コンポーネントの詳細

### 1. M5Tab OMIP 実装

M5Tabを、ショートカットキーの実行やアプリケーションの制御に使えるパワフルな入力デバイスに変身させます。

![M5Tab Demo](https://place-hold.it/600x400?text=M5Tab+OMIP+Demo)

#### 実行方法

**Step 1: ファームウェアの書き込み**

M5TabにOMIP対応ファームウェアを書き込みます。
詳細な手順は、このプロジェクトの初期ドキュメントである [M5Tab開発ガイド](M5Tab_OMIP/readme.md) を参照してください。（注: このドキュメントは今後、より簡潔なセットアップガイドに再編される予定です）

**Step 2: PCアプリケーションの実行**

PC側のバックエンドとUIを起動します。

1.  **Python環境のセットアップ:**
    `M5Tab_OMIP/pc_software/` ディレクトリで、仮想環境の作成と依存関係のインストールを行います。
    ```shell
    # Windows
    python -m venv venv
    venv\Scripts\activate
    pip install -r requirements.txt

    # macOS / Linux
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

2.  **UIのセットアップ:**
    `M5Tab_OMIP/pc_software/ui/` ディレクトリで、Node.jsの依存関係をインストールします。
    ```shell
    cd M5Tab_OMIP/pc_software/ui
    npm install
    ```

3.  **アプリケーションの起動:**
    `M5Tab_OMIP/pc_software/` にある `start-test-env.bat` を実行します。
    これにより、バックエンドのPythonスクリプトと、UIを開発モードで起動するElectronアプリケーションが同時に立ち上がります。

    起動後、UI上でM5Tabが接続されているシリアルポートを選択して「Connect」ボタンを押すと、デバイスとの通信が開始されます。

### 2. Joy-Con PC ユーティリティ

Joy-ConをPCの入力デバイスとして活用するためのツールです。ボタンやスティックの入力を、キーボードショートカットやマウス操作に自由にマッピングできます。

#### 実行方法

1.  **Python環境のセットアップ:**
    リポジトリのルートにある `pc_software/` ディレクトリで、仮想環境の作成と依存関係のインストールを行います。
    ```shell
    # Windows
    cd pc_software
    python -m venv venv
    venv\Scripts\activate
    pip install -r requirements.txt

    # macOS / Linux
    cd pc_software
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

2.  **アプリケーションの起動:**
    `main.py` を実行すると、Webサーバーが起動します。
    ```shell
    python main.py
    ```
    ブラウザで `http://127.0.0.1:8000` にアクセスすると、接続されているJoy-Conの設定画面が表示されます。

---

## 開発

### プロトコル定義の更新

OMIPの仕様は `proto/omip.proto` で定義されています。このファイルを変更した場合、各言語用のソースコードを再生成する必要があります。

**Python (`_pb2.py`) の生成:**

`protoc` (Protocol Buffer Compiler) が必要です。
```shell
# リポジトリのルートで実行
protoc --python_out=. proto/omip.proto
```
これにより、`omip_pb2.py` が生成・更新されます。

**C/C++ (`.pb.c`, `.pb.h`) の生成:**

C言語用のコード生成には `nanopb` を利用します。

1.  `nanopb` をセットアップします。（[公式ガイド](https://jpa.kapsi.fi/nanopb/docs/generator.html)参照）
2.  以下のコマンドを実行します。
    ```shell
    # リポジトリのルートで実行
    nanopb_generator -I proto -D firmware/master_hub proto/omip.proto
    nanopb_generator -I proto -D M5Tab_OMIP/src proto/omip.proto
    ```
    これにより、各ファームウェアプロジェクト内に `.pb.c` と `.pb.h` ファイルが生成・更新されます。
