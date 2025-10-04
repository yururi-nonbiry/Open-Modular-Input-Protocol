# プロジェクトタスク一覧

## 完了済みタスク

### 1. プロジェクト基盤構築
- [x] `README.md`に基本仕様と技術選定を定義
- [x] `README.md`にProtobufスキーマやディレクトリ構造などの詳細仕様を追記
- [x] `proto`, `firmware`, `pc_software`, `docs`のディレクトリ構造を作成
- [x] `proto/omip.proto` プロトコル定義ファイルを作成

### 2. PCソフトウェア (バックエンド)
- [x] Pythonの仮想環境 (`pc_software/venv`) をセットアップ
- [x] `requirements.txt`を作成し、pyserial, protobuf, pynputを定義
- [x] Protobuf定義からPythonコード (`omip_pb2.py`) を生成
- [x] アーキテクチャをWebベースに変更
- [x] `requirements.txt`に`fastapi`, `uvicorn`, `python-socketio`などを追加し、インストール
- [x] `pc_software/main.py`をFastAPI + WebSocketサーバーとして再実装
- [x] サーバー起動時にシリアル通信をバックグラウンドで実行するよう設定

### 3. PCソフトウェア (フロントエンド)
- [x] `pc_software/ui`にVite + React + TypeScriptのプロジェクトを作成
- [x] フロントエンドプロジェクトの依存関係をインストール (`npm install`)
- [x] `Electron`および関連ライブラリ (`electron-builder`など) をインストール
- [x] Electronのメインプロセスファイル (`public/electron.js`) を作成
- [x] `package.json`を編集し、Electronの起動スクリプトをセットアップ

## 残りのタスク

### 1. PCソフトウェア (フロントエンド)
- [x] **タスクトレイ常駐化**
    - [x] 起動時にウィンドウを開かず、タスクトレイにアイコンを表示する
    - [x] トレイアイコンの右クリックメニュー（設定、終了など）を実装する
    - [x] メニューから設定画面を開けるようにする
- [x] **UIの実装**
    - [x] バックエンドのWebSocketサーバーに接続するクライアントを実装する
    - [x] サーバーから受信したデバイスデータを画面に表示するコンポーネントを作成する
    - [x] 設定画面のUIを設計・実装する

### 2. ファームウェア (デバイス側)
- [x] `nanopb`を使い、`.proto`ファイルからC言語のヘッダ/ソースファイルを生成する
- [x] ESP32のサンプルファームウェアを作成する
    - [x] ボタンやアナログ入力の状態を読み取る
    - [x] 読み取ったデータをProtobufメッセージとしてシリアライズする
    - [x] 定義したフレーム形式でUSBシリアル経由でPCに送信する

### 3. 統合とパッケージ化
- [x] PythonバックエンドとElectronフロントエンドを一つのアプリケーションとして統合する仕組みを構築する
- [x] `electron-builder`を設定し、配布可能なインストーラー（.exeなど）を作成する
