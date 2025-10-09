# M5Tab OMIP Firmware

## 概要

このプロジェクトは、[M5Tab](https://docs.m5stack.com/en/core/m5stack_core2)デバイス上で動作する[Open Modular Input Protocol (OMIP)](https://github.com/s-show/Open-Modular-Input-Protocol) のファームウェアです。

OMIPは、モジュール式の入力デバイスとホストアプリケーション間で、柔軟かつ効率的に通信を行うためのプロトコルです。
このファームウェアは、M5TabをOMIP互換の入力デバイスとして機能させることを目的としています。

## プロトコル

通信には[Protocol Buffers](https://protobuf.dev/)の組み込み向け実装である[Nanopb](https://jpa.nanopb.fi/)を利用しています。
主なメッセージタイプは以下の通りです。

- **入力メッセージ (デバイス → ホスト):**
  - `InputDigital`: デジタル入力（ボタンの状態など）
  - `InputAnalog`: アナログ入力（センサーの値など）
  - `InputEncoder`: ロータリーエンコーダーの入力
- **フィードバックメッセージ (ホスト → デバイス):**
  - `FeedbackImage`: 画面への画像描画
  - `FeedbackLed`: LEDの色や点灯状態の制御
- **機能ネゴシエーション:**
  - `DeviceCapabilityRequest` / `DeviceCapabilityResponse`: デバイスが持つ機能（ポートの種類や数）をホストに通知します。

## 開発環境

- **ハードウェア:** M5Tab
- **フレームワーク:** [PlatformIO](https://platformio.org/)
- **ライブラリ:**
  - M5Unified
  - M5GFX
  - Nanopb
