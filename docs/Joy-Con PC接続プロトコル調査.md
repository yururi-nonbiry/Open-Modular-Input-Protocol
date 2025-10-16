

# **Nintendo Switch Joy-Con通信プロトコルおよびPC統合アーキテクチャに関する技術報告書**

## **第1章 エグゼクティブサマリーと序論**

### **1.1. 目的とスコープ**

本報告書は、Nintendo Switch Joy-Conの通信プロトコル、およびそれをWindows PC環境で利用するためのソフトウェアアーキテクチャについて、包括的かつ詳細な技術的分析を提供することを目的とする。利用者からの当初の問い合わせはvJoyリポジトリに関するものであったが、本報告書ではまずvJoyの役割と限界を明確にした上で、より広範なエコシステム、特に現代のPCゲーミング環境における標準的なソリューションに焦点を当てる。

スコープは以下の通りである。

1. vJoyプロジェクトのアーキテクチャと目的の分析。  
2. リバースエンジニアリングによって解明されたJoy-Conの低レベルBluetooth HID通信プロトコル（初期化シーケンス、入出力レポート、特殊コマンドを含む）の詳細な解説。  
3. HD振動（HD Rumble）機能を制御するための特有のプロトコル仕様の分析。  
4. このプロトコルを実装し、仮想コントローラドライバと連携する主要なソフトウェアフレームワーク（例：BetterJoy, JoyconLib）のアーキテクチャ比較分析。  
5. 仮想ドライバにおけるDirectInput（vJoyが生成）とXInput（ViGEmBusが生成）の決定的な違いと、その互換性への影響の評価。

### **1.2. 主要な調査結果の概要**

本報告書の分析を通じて得られた主要な結論は以下の通りである。

* **プロトコルの独自性:** Joy-Conの通信は、標準的なBluetooth HIDプロトコルを基盤としつつ、独自に拡張されたサブコマンドシステムを利用する、複雑でプロプライエタリな仕様である。その全機能を利用するには、リバースエンジニアリングによって解明された特定のコマンドシーケンスが必須となる。  
* **vJoyの役割:** vJoyは、Joy-Con専用のツールではなく、任意の入力ソースからのデータを仮想的な標準ジョイスティックデバイスとしてOSに認識させるための、汎用的なDirectInput仮想ドライバである 1。  
* **現代的ソリューションのアーキテクチャ:** BetterJoyに代表される現代的なソリューションは、階層的なアーキテクチャを採用している。具体的には、Joy-Conのプロトコルを解釈するライブラリ（例：JoyconLib）が物理デバイスからデータを読み取り、そのデータを仮想ドライバ（一般的にはXInputエミュレーション用のViGEmBus）に供給（フィード）することで、ゲームアプリケーションとの互換性を確保する 3。  
* **DirectInputとXInputの重要性:** 仮想ドライバの選択は、現代のゲームとの互換性において極めて重要である。vJoyが生成するDirectInputデバイスは多くの古いアプリケーションで機能するが、現代のPCゲームの多くはXInput APIを前提としており、ViGEmBusのようなXInputエミュレーションドライバの使用が事実上の標準となっている 5。

### **1.3. 報告書の構成**

本報告書は以下の章で構成される。第2章では、問い合わせの起点となったvJoyのアーキテクチャを分析する。第3章では、Joy-Conの核心であるBluetooth HID通信プロトコルを詳細に解説する。第4章では、特徴的な機能であるHD振動のプロトコルを掘り下げる。第5章では、これらのプロトコルを実装するソフトウェアのアーキテクチャパターンを、具体的なケーススタディを交えて分析する。最後に第6章で、全体の分析を統合し、結論を述べる。

## **第2章 vJoyのアーキテクチャ分析**

### **2.1. コア機能と設計思想**

vJoyは、もともとPPJoyのオープンソース代替品として設計された、Windows向けの汎用仮想ジョイスティックドライバである 1。その設計思想の核心は、OSからは標準的なジョイスティックデバイスとして認識される仮想デバイスを作成し、その位置データやボタンの状態を「フィーダー（feeder）」と呼ばれる外部アプリケーションからプログラム的に書き込むという点にある 1。

技術仕様として、vJoyは最大8軸、128ボタン、そして4つのPOV（Point of View）ハットスイッチをサポートする設定が可能であり、ドライバは32ビットおよび64ビットのWindowsシステムに対応し、デジタル署名されている 1。プロジェクトの主要な開発言語はC++とCである 7。この設計により、開発者は物理的なハードウェアをエミュレートし、キーボードやマウスといった非標準的な入力デバイスを、ジョイスティックを要求するアプリケーション（フライトシミュレータや各種ゲームなど）で使用できるようになる。

### **2.2. フィーダーアプリケーションモデル**

vJoyのアーキテクチャは、カーネルモードで動作するvJoyドライバと、ユーザーモードで動作するフィーダーアプリケーションとの間の明確な役割分担に基づいている。

1. **vJoyドライバ:** OSに対して仮想的なハードウェアインターフェースを提供する。HID（Human Interface Device）クラスのデバイスとして登録され、DirectInput APIなどを通じてアプリケーションからアクセス可能となる。  
2. **フィーダーアプリケーション:** 実際の入力処理ロジックを担う。このアプリケーションが、物理的なデバイス（Joy-Con、キーボード、マウスなど）からの入力を受け取り、それをvJoyが理解できる形式のデータ（軸の値、ボタンの状態など）に変換し、vJoyドライバに供給する 1。

この連携を実現するため、vJoyはSDK（Software Development Kit）を提供している。SDKにはC/C++、C\#などの言語で使用できるAPIが含まれており、開発者はこれを利用して独自のフィーダーアプリケーションを容易に作成できる 1。APIの中心となるのは、ジョイスティックの状態を定義するJOYSTICK\_STATE構造体と、ドライバの初期化や状態更新を行うVJoy\_Initialize()、VJoy\_UpdateJoyState()といった関数群である 9。このモデルの汎用性により、vJoyは多様なカスタムコントロールソリューションの基盤として利用されてきた。

### **2.3. Joy-Con統合における関連性と限界**

vJoyのアーキテクチャを理解すると、Joy-Con統合におけるその役割と限界が明確になる。vJoy自体はJoy-Conの通信プロトコルに関する知識を一切持っていない。したがって、Joy-ConをvJoyで利用するためには、開発者がJoy-ConのBluetooth HID通信を解読し、そのデータを読み取ってvJoyドライバに供給するカスタムフィーダーアプリケーションを別途作成する必要がある。

このアプローチは技術的には可能であるが、現代のPCゲーミング環境においては決定的な限界に直面する。その最大の要因は、vJoyが生成する仮想デバイスが**DirectInput**デバイスであるという点にある。vjoyのnpmパッケージに関するドキュメントでも指摘されているように、DirectInputコントローラは、Xbox 360コントローラのAPIである**XInput**を標準とする現代の多くのゲームと互換性がない 5。

この互換性の問題は、なぜJoy-ConのPC利用エコシステムがvJoyから離れ、XInputをエミュレートする他のソリューションへと移行したかを説明する上で極めて重要なポイントである。vJoyのフィーダーアーキテクチャという概念自体は非常に強力であり、後述するBetterJoyのような現代的なツールも、形は違えど「入力ソース → 変換ロジック → 仮想ドライバ」という同様のパターンを踏襲している。しかし、その最終的な出力先である仮想ドライバのAPIがDirectInputであるという点が、vJoyをJoy-Con利用の主流な選択肢から外す要因となっている。したがって、最適なソリューションを理解するためには、vJoyの分析を起点としつつも、XInputエミュレーションという現代的な要請に応える技術へと焦点を移す必要がある。

## **第3章 Joy-Con通信プロトコル：リバースエンジニアリングによる詳細解析**

### **3.1. 基礎：dekuNukem/Nintendo\_Switch\_Reverse\_Engineeringプロジェクト**

PCにおけるJoy-Conの相互運用性を実現するほぼ全てのプロジェクトは、dekuNukem/Nintendo\_Switch\_Reverse\_Engineeringと題されたリバースエンジニアリングプロジェクトの成果に基づいている 11。このプロジェクトは、Joy-Conのハードウェア構造、内部コンポーネント、そして最も重要な通信プロトコルの詳細を解明し、公開したものであり、本章で解説する技術的詳細の大部分はこの seminal work（独創的な研究）に依拠している。

### **3.2. 物理（ドック接続）通信と無線（Bluetooth）通信**

Joy-Conは、Switch本体との接続方法に応じて二つの異なる通信モードを持つ。

**物理通信:** Joy-ConがSwitch本体のレールに物理的に接続されている場合、Bluetoothではなく、10ピンのコネクタを介した高速なシリアル通信が使用される 14。この通信は、初期ハンドシェイク時には1,000,000 bpsで開始され、その後3,125,000 bpsに高速化される 14。このモードはPCでの利用には直接関連しないが、プロトコルの全体像を理解する上で重要である。

---

**表1: Joy-Con ドック接続用コネクタのピン配置と機能**

| ピン番号 | 機能 | 備考 |
| :---- | :---- | :---- |
| 1 | GND | グラウンド |
| 2 | GND | グラウンド |
| 3 | Jdet | コンソールに接続されるとLOWにプルされる。このピンがLOWでないとシリアルデータを送信しない。 |
| 4 | 5V | Joy-Conへの給電および充電用。 |
| 5 | Serial data (Console to Joy-Con) | コンソールからJoy-Conへのシリアルデータ。反転レベル（アイドル時GND）。 |
| 6 | JRST | Joy-Conリセット信号。HIGHレベルでリセット。 |
| 7 | GND | グラウンド |
| 8 | Serial data (Joy-Con to Console) | Joy-Conからコンソールへのシリアルデータ。標準レベル（アイドル時1.8V）。 |
| 9 | Power output | リングフィットアドベンチャーなどの周辺機器への電力出力。 |
| 10 | Flow control | このラインがHIGHの場合にのみJoy-Conはデータを送信する。 |
| 出典: 14 |  |  |

---

**無線通信:** PCとの接続で主に使用されるのは、標準的なBluetoothによる無線通信である。ペアリングプロセス自体は標準的だが、その後のデータ交換は、高度にカスタマイズされたHID（Human Interface Device）プロトコルを用いて行われる。OSからは「ゲームパッド」として認識されるものの、その全機能を引き出すためには、単なるHID入力レポートの受信だけでは不十分である 16。通信の核心は、ホスト（PC）からJoy-Conへ**サブコマンドを含むHID出力レポート**を送信し、Joy-Conの内部状態を設定・制御する点にある。

### **3.3. 初期化およびモード設定シーケンス**

Joy-Conのプロトコルは、単に状態をブロードキャストする単純なものではなく、「ステートフルかつ対話的」な性質を持つ。つまり、PCはSwitch本体のように振る舞い、特定のコマンドを正しい順序で送信することで、Joy-Conの機能を段階的に「アンロック」する必要がある。この初期化シーケンスは、Joy-Conを完全な動作状態にするために不可欠である。

1. IMU（慣性計測装置）の有効化 (サブコマンド 0x40):  
   デフォルトでは、電力消費を抑えるため、6軸のIMU（ジャイロスコープと加速度センサー）は無効化されている。これを有効にするには、ホストはサブコマンド0x40に引数0x01を付けて送信する必要がある 17。このコマンドを送信しない限り、モーションセンサーのデータは取得できない。  
2. 入力レポートモードの設定 (サブコマンド 0x03):  
   これが最も重要なステップである。ホストは、Joy-Conに対してどのような形式でデータを送信してほしいかを指示する必要がある。最も重要なモードは、引数0x30で指定される\*\*「標準フルモード（Standard Full Mode）」\*\*である 17。このモードに設定すると、Joy-Conはサブコマンドへの応答を返す代わりに、ボタン、スティック、そして有効化されたIMUのデータを含む完全な状態レポートを、約60Hzの頻度で継続的にプッシュ送信するようになる。このモードに移行することで、ホストはポーリングを行うことなく、リアルタイムでコントローラの状態を把握できる。

この対話的な設計は、おそらく電力管理の最適化（不要なセンサーはデフォルトでオフにする）と、サポートされていないデバイスからの安易なアクセスを防ぐという二重の目的を持っていると考えられる。開発者にとってこれは、単純なHIDライブラリだけでは不十分であり、このステートフルなハンドシェイクを管理するロジックを実装した、より高度なプロトコルライブラリ（例：JoyconLib）が必須であることを意味する。

---

**表2: Joy-Conの初期化と制御に使われる主要なBluetooth HIDサブコマンド**

| サブコマンド | 機能 | 引数（例） | 説明 |
| :---- | :---- | :---- | :---- |
| 0x01 | Bluetooth手動ペアリング | \- | ペアリング情報を要求する。 |
| 0x03 | 入力レポートモード設定 | 0x30: 標準フルモード | Joy-Conが送信するレポートの形式を指定する。0x30が最も一般的。 |
| 0x10 | ランブル（振動）データ送信 | (8バイトのデータ) | HD振動を制御するためのデータを送信する。 |
| 0x30 | プレイヤーLED設定 | 0x0F: 全点灯 | コントローラのプレイヤーインジケーターLEDの点灯パターンを設定する。 |
| 0x40 | IMU（6軸センサー）有効化 | 0x01: 有効 | モーションセンサーを有効化する。デフォルトは無効。 |
| 0x48 | IMU感度設定 | (各種設定値) | IMUの感度や測定レンジを設定する。 |
| 0x50 | 電圧情報取得 | \- | バッテリー電圧に関する情報を要求する。 |
| 出典: 17 |  |  |  |

---

### **3.4. 入力レポート 0x30 (標準フルモード) のデータ構造**

Joy-Conが「標準フルモード」で送信する入力レポートは、IDが0x30で、コントローラの全状態を含む固定長のパケットである。このバイトストリームを正しく解釈することが、Joy-Conからの入力をアプリケーションで利用するための鍵となる。

このデータ構造は、Nintendoが単一のHIDレポートチャネル上でデータを多重化していることを示している。つまり、レポートのペイロードの意味は、サブコマンド0x03によって設定された現在の「モード」に依存する。これは、Bluetooth接続を効率的に利用するための設計上のトレードオフであり、ホスト側にはより複雑な状態管理が要求される。

---

**表3: 標準フルモード入力レポート (0x30) のバイトレイアウト**

| バイトオフセット | サイズ（バイト） | 内容 | 説明 |
| :---- | :---- | :---- | :---- |
| 0 | 1 | レポートID | 0x30 |
| 1 | 1 | タイマー | 0-255を繰り返す8ビットのタイマー。 |
| 2 | 1 | バッテリーと接続状態 | 上位4ビットがバッテリーレベル、下位4ビットが接続情報。 |
| 3-5 | 3 | ボタン状態 | 右、共有、左の各ボタンの状態をビットフィールドで表現。 |
| 6-8 | 3 | 左アナログスティック | 12ビット精度でX軸とY軸のデータをエンコード。 |
| 9-11 | 3 | 右アナログスティック | 12ビット精度でX軸とY軸のデータをエンコード。 |
| 12 | 1 | 振動入力レポーター | \- |
| 13-24 | 12 | IMUデータ (1) | 1セット目の加速度(X,Y,Z)とジャイロ(X,Y,Z)データ。各軸16ビット符号付き整数。 |
| 25-36 | 12 | IMUデータ (2) | 2セット目の加速度とジャイロデータ。 |
| 37-48 | 12 | IMUデータ (3) | 3セット目の加速度とジャイロデータ。 |
| 注: この構造はリバースエンジニアリングによる解釈であり、一部のフィールドは未解明または用途が限定的である可能性がある。出典: 14 および関連プロジェクトのソースコード分析に基づく。 |  |  |  |

---

## **第4章 HD振動プロトコル**

### **4.1. HD振動の概要**

Joy-ConのHD振動（HD Rumble）は、従来の回転モーターによる単純なオン/オフの振動とは一線を画す、高度なハプティックフィードバックシステムである。これはリニア共振アクチュエータ（LRA）を使用しており、振動の**周波数**と**振幅**を個別に、かつ広範囲にわたって精密に制御することができる。これにより、ガラスのコップに氷が当たる感覚や、液体が揺れる感覚といった、非常に繊細でリアルな触感を再現することが可能となる。

### **4.2. ランブルデータのエンコーディング**

この高度な制御を実現するため、HD振動のデータは非常に複雑な非線形のエンコーディング方式を採用している。ホストは、希望する周波数（Hz）と振幅（%）を直接送信するのではなく、rumble\_data\_table.mdで詳述されているアルゴリズムに従って、これらを8バイトのデータパケットにエンコードし、サブコマンド0x10で送信する必要がある 20。

周波数のエンコーディング:  
希望する周波数 freq (Hz) は、以下の対数式を用いて8ビットのエンコード値に変換される 20。  
$$\\text{encoded\\\_hex\\\_freq} \= \\text{round}(\\log\_{2}(\\frac{\\text{freq}}{10.0}) \\times 32.0)$$  
この式は、人間の感覚が物理量の対数に比例して変化するというウェーバー・フェヒナーの法則に類似している。つまり、低い周波数帯ではわずかな変化も敏感に感じ取れるが、高い周波数帯では大きな変化がないとその差を感じにくいという、人間の知覚特性に合わせてデータ空間を効率的に使用している。このエンコード値は、最終的なコマンドパケット内で、さらに高周波（High-Frequency, HF）成分と低周波（Low-Frequency, LF）成分に分解されて格納される 20。

振幅のエンコーディング:  
振幅 amp も同様に対数的なエンコーディングが行われるが、振幅の範囲によって異なる計算式が用いられる 20。

* amp \> 0.23 の場合:  
  $$\\text{encoded\\\_hex\\\_amp} \= \\text{round}(\\log\_{2}(\\text{amp} \\times 8.7) \\times 32.0)$$  
* 0.12 \< amp \<= 0.23 の場合:  
  $$\\text{encoded\\\_hex\\\_amp} \= \\text{round}(\\log\_{2}(\\text{amp} \\times 17.0) \\times 16.0)$$

このエンコード値も、高周波振幅（HF\_amp）と低周波振幅（LF\_amp）のコンポーネントに変換される。このような対数エンコーディングは、Nintendoがハプティック体験の質に深く投資していることを示す洗練されたエンジニアリングの選択であり、他のコントローラの単純なオン/オフ振動ではこの効果を再現できない理由を説明している。

### **4.3. エンコーディングテーブルと実践**

これらの複雑な計算を毎回行う代わりに、開発者は事前に計算された参照テーブルを利用することができる。これにより、目的の振動効果に対応するバイト値を迅速に見つけ出すことが可能となる。

---

**表4: HD振動 周波数エンコーディング参照テーブル（抜粋）**

| 周波数 (Hz) | エンコード後 HF (HEX) | エンコード後 LF (HEX) |
| :---- | :---- | :---- |
| 41 | 04 00 | 01 |
| 80 | 84 00 | 20 |
| 160 | 04 01 | 40 |
| 320 | 84 01 | 60 |
| 640 | 04 02 | 80 |
| 1253 | FC 01 | 7F |
| 出典: 20のデータに基づく。HFは16ビット値、LFは8ビット値。 |  |  |

---

---

**表5: HD振動 振幅エンコーディング参照テーブル（抜粋）**

| 振幅（おおよその%） | エンコード後 HF\_amp (HEX) | エンコード後 LF\_amp (HEX) |
| :---- | :---- | :---- |
| 0.0% | 00 | 40 00 |
| 1.2% | 04 | 41 00 |
| 11.7% | 20 | 48 00 |
| 23.0% | 40 | 50 00 |
| 46.0% | 80 | 60 00 |
| 92.0% | C0 | 70 00 |
| 100.0% | C8 | 72 00 |
| 出典: 20のデータに基づく。HF\_ampは8ビット値、LF\_ampは16ビット値。 |  |  |

---

最終的に、左右のモーターそれぞれに対して4バイト（HF 2バイト、LF 1バイト、HF\_amp 1バイト、LF\_ampの組み合わせ）のデータが生成され、合計8バイトのペイロードとしてサブコマンド0x10で送信される。この際、バイトの組み合わせには特殊な加算ロジックが用いられるため、実装には細心の注意が必要である 20。

## **第5章 ソフトウェア実装とアーキテクチャパターン**

Joy-Conのような非標準コントローラをPCで利用可能にするためのソフトウェアは、特定のアーキテクチャパターンに従って構築されている。このパターンは、ハードウェアとの直接通信、プロトコルの解釈、そしてOSやアプリケーションへの入力提供という、関心事の分離に基づいている。

### **5.1. 階層型アーキテクチャモデル**

成功しているJoy-Con統合ソフトウェアは、一般的に以下の6つの階層から構成されるモデルとして理解できる。

1. **第1層 (ハードウェア層):** 物理的なJoy-Conコントローラ。  
2. **第2層 (ドライバ/API層):** OSの標準Bluetoothスタックと、hidapiのような低レベルライブラリ。デバイスとの基本的なHIDレポートの送受信を担う。  
3. **第3層 (プロトコルライブラリ層):** Joy-Con独自のプロトコルを実装する専用ライブラリ（例: JoyconLib, joycon-python）。第3章で解説したサブコマンドのハンドシェイク、入力レポートの解析、HD振動データのエンコードなどを行う。  
4. **第4層 (アプリケーションロジック層):** メインアプリケーション（例: BetterJoy）。プロトコルライブラリから解析済みのデータを受け取り、左右Joy-Conの結合・分離、ボタンマッピング、ジャイロ操作のマウスへの変換などの高レベルなロジックを処理する。  
5. **第5層 (仮想ドライバ層):** OSに対して仮想的なコントローラデバイスを提供するカーネルモードドライバ（例: vJoy, ViGEmBus）。  
6. **第6層 (クライアントアプリケーション層):** 最終的に仮想コントローラの入力を利用するゲームやエミュレータ。

この階層モデルは、Joy-Con統合における二つの主要なアプローチ、すなわち**システム全体でのエミュレーション**と**特定のアプリケーションへの直接統合**を明確に区別する上で役立つ。

### **5.2. ケーススタディ: BetterJoyとViGEmBus**

BetterJoyは、「システム全体でのエミュレーション」アプローチの代表例である 3。その目標は、Joy-ConをCemu、Dolphin、Steamなど、XInputコントローラをサポートするあらゆるPCアプリケーションで利用可能にすることである。

この目標を達成するため、BetterJoyは前述の階層モデルを忠実に実装している。

* **プロトコルライブラリ層:** JoyconLibのフォークを利用して、Joy-Conとの通信とデータ解析を行う 4。  
* **仮想ドライバ層:** 最も重要な点として、BetterJoyはvJoyではなく**ViGEmBus (Virtual Gamepad Emulation Bus)** ドライバを利用する 3。ViGEmBusは仮想的なXbox 360コントローラを生成することができ、これによりネイティブな**XInput**互換性を提供する。これが、第2章で指摘したvJoyのDirectInputの限界を克服する鍵となる。  
* **二重入力問題の解決:** このアーキテクチャでは、ゲームが物理的なJoy-Con（HIDデバイス）と仮想的なXbox 360コントローラ（XInputデバイス）の両方を認識してしまい、入力が競合する「二重入力」問題が発生する。BetterJoyは、この問題を解決するために**HidGuardian**のようなツールを導入している 3。HidGuardianは、特定のHIDデバイス（この場合は物理Joy-Con）を多くのアプリケーションから「隠蔽」し、仮想XInputコントローラのみが見えるようにする低レベルのフィルタドライバである。HidGuardianの必要性は、Windowsの入力デバイス管理におけるシステム的な制約、すなわちアプリケーションごとに入力デバイスを優先・非表示にする簡単なネイティブ機能が欠けていることを示唆しており、コミュニティが複雑なドライバベースの回避策を開発せざるを得なかった背景を物語っている。

### **5.3. ケーススタディ: JoyconLib for Unity**

JoyconLibは、「特定のアプリケーションへの直接統合」アプローチの好例である 12。これは、特定のゲームエンジン（この場合はUnity）内でJoy-Conを直接利用するために設計されたライブラリである。

このアプローチでは、システム全体で認識される仮想コントローラは作成されない。代わりに、JoyconLibは第2層（hidapiを内包）と第3層（プロトコル実装）の機能をUnityプロジェクト内に直接提供する 12。これにより、Unity開発者はC\#のAPIを通じて、ゲームコード内から直接ボタンの状態、IMUデータ、HD振動にアクセスできる。

このアーキテクチャは、ターゲットアプリケーションがUnityゲームのみに限定される場合に、よりシンプルでパフォーマンスの高いソリューションを提供する。システムワイドな仮想ドライバやHidGuardianのような複雑なコンポーネントが不要になるため、導入と配布が容易になる。

### **5.4. 実装フレームワークの比較概要**

以下に、本報告書で分析した主要なソフトウェアフレームワークの比較を示す。この比較は、開発者が自身のプロジェクトの要件に最適なツールを選択する際の指針となる。

---

**表6: Joy-Con統合ソフトウェアフレームワークの比較分析**

| フレームワーク | 主要目的 | 出力タイプ | 主要な依存関係 | ターゲットユースケース |
| :---- | :---- | :---- | :---- | :---- |
| **vJoy** | 汎用仮想ジョイスティックの提供 | DirectInput | \- | レガシーアプリケーション、カスタム入力マッピング |
| **BetterJoy** | Joy-Conのシステムワイドなエミュレーション | XInput | ViGEmBus, HidGuardian | PCゲーム全般、エミュレータ（Cemu, Yuzu等） |
| **JoyconLib (for Unity)** | Unityエンジン内でのJoy-Con直接利用 | なし（直接APIアクセス） | hidapi | Unityで開発された特定のゲーム |
| 出典: 1 |  |  |  |  |

---

この分析から、開発者が直面する選択は明確である。広範なゲームとの互換性を求めるならば、BetterJoyとViGEmBusによるシステムワイドなXInputエミュレーションが標準的な選択肢となる。一方、特定のUnityアプリケーション内でJoy-Conの機能を最大限に活用したい場合は、JoyconLibのような直接統合ライブラリがより効率的である。

## **第6章 統合と結論**

### **6.1. 技術的特性の要約**

本報告書の分析により、Nintendo Switch Joy-Conの通信プロトコルとPC統合アーキテクチャに関する以下の技術的特性が明らかになった。

* **プロトコルの性質:** Joy-ConのBluetooth通信は、ステートフルかつ対話的な、サブコマンド駆動型のプロプライエタリなプロトコルである。その全機能（特にIMUと継続的なデータストリーミング）を有効化するには、特定の初期化シーケンスが必須となる。  
* **データストリーミング:** サブコマンド0x03と引数0x30を用いて「標準フルモード」に移行させることで、コントローラの全状態を含むレポートが約60Hzで継続的に送信される。これがリアルタイム入力処理の基礎となる。  
* **HD振動:** HD振動は、周波数と振幅を個別に制御するための複雑な対数エンコーディング方式を採用しており、これにより他のコントローラでは再現不可能な繊細なハプティックフィードバックを実現している。

### **6.2. 主流となるアーキテクチャパターン**

Joy-Conのような非標準コントローラをPCに統合するための最も成功し、主流となっているアーキテクチャは、明確な関心事の分離に基づいた階層モデルである。このモデルは、低レベルのHID通信を担うライブラリ、独自のプロトコルを解釈するライブラリ、そして最終的な入力をOSやゲームに提供する仮想デバイスドライバというコンポーネントに分割される。この分離により、各コンポーネントの再利用性と保守性が向上する。

### **6.3. 最終勧告：DirectInput対XInput**

本報告書の分析を通じて得られる最も重要な結論は、仮想ドライバの出力ターゲットの選択に関するものである。

利用者からの当初の問い合わせはvJoyに関するものであったが、vJoyが生成する**DirectInput**デバイスは、現代のPCゲーミングエコシステムにおいては互換性の面で大きな問題を抱えている。現在、PCゲームのデファクトスタンダードはMicrosoftの**XInput** APIであり、ほとんどの新作ゲームや主要なゲームプラットフォーム（Steamなど）はこのAPIを前提として設計されている。

したがって、Joy-Conを現代のPCゲームで快適に利用するための最適なソリューションを求める開発者やエンドユーザーに対する最終的な勧告は明確である。**ViGEmBusのようなフレームワークを用いたXInputエミュレーションが、必須の標準である。**

この結論は、当初の「Joy-ConをvJoyでどう使うか？」という問いに対して、「より優れた代替手段を用いるべきであり、その理由は技術的な互換性の要請にある」という、より専門的で実践的な回答を提供するものである。BetterJoyのようなツールは、このXInputエミュレーションを、プロトコル解釈や二重入力問題の解決策と併せて包括的に提供しており、現時点での最も完成されたソリューションと言える。

#### **引用文献**

1. vJoy download | SourceForge.net, 10月 16, 2025にアクセス、 [https://sourceforge.net/projects/vjoystick/](https://sourceforge.net/projects/vjoystick/)  
2. Download vJoySetup.exe (vJoy) \- SourceForge, 10月 16, 2025にアクセス、 [https://sourceforge.net/projects/vjoystick/files/Beta%202.x/2.1.8.39-270518/vJoySetup.exe/download](https://sourceforge.net/projects/vjoystick/files/Beta%202.x/2.1.8.39-270518/vJoySetup.exe/download)  
3. Dudejoe870/BetterJoyForCemu: Allows the Nintendo Switch Pro Controller and Joycons to be used with the Cemu Emulator and System-Wide \- GitHub, 10月 16, 2025にアクセス、 [https://github.com/Dudejoe870/BetterJoyForCemu](https://github.com/Dudejoe870/BetterJoyForCemu)  
4. Davidobot/BetterJoy: Allows the Nintendo Switch Pro ... \- GitHub, 10月 16, 2025にアクセス、 [https://github.com/Davidobot/BetterJoy](https://github.com/Davidobot/BetterJoy)  
5. vjoy \- Yarn Classic, 10月 16, 2025にアクセス、 [https://classic.yarnpkg.com/en/package/vjoy](https://classic.yarnpkg.com/en/package/vjoy)  
6. Project Architecture | Nintenduino Project Homepage \- WordPress.com, 10月 16, 2025にアクセス、 [https://nintenduino.wordpress.com/documentation/project-architecture/](https://nintenduino.wordpress.com/documentation/project-architecture/)  
7. shauleiz/vJoy: Virtual Joystick \- GitHub, 10月 16, 2025にアクセス、 [https://github.com/shauleiz/vJoy](https://github.com/shauleiz/vJoy)  
8. vJoy | Nintenduino Project Homepage \- WordPress.com, 10月 16, 2025にアクセス、 [https://nintenduino.wordpress.com/documentation/vjoy/](https://nintenduino.wordpress.com/documentation/vjoy/)  
9. ReadMe PDF \- Scribd, 10月 16, 2025にアクセス、 [https://www.scribd.com/document/323583909/ReadMe-pdf](https://www.scribd.com/document/323583909/ReadMe-pdf)  
10. benbaker76/VJoy: VJoy Virtual Joystick is a software application and virtual driver system that allows keyboard input to be translated to joystick input. \- GitHub, 10月 16, 2025にアクセス、 [https://github.com/benbaker76/VJoy](https://github.com/benbaker76/VJoy)  
11. Use the Nintendo Switch Joy-Cons via the WebHID API \- GitHub, 10月 16, 2025にアクセス、 [https://github.com/tomayac/joy-con-webhid](https://github.com/tomayac/joy-con-webhid)  
12. JoyconLib \- Hackaday.io, 10月 16, 2025にアクセス、 [https://hackaday.io/project/27986-joyconlib](https://hackaday.io/project/27986-joyconlib)  
13. redphx/joydance: Use Joy-Cons to play Ubisoft's Just Dance on all platforms \- GitHub, 10月 16, 2025にアクセス、 [https://github.com/redphx/joydance](https://github.com/redphx/joydance)  
14. dekuNukem/Nintendo\_Switch\_Reverse\_Engineering: A look at inner workings of Joycon and Nintendo Switch \- GitHub, 10月 16, 2025にアクセス、 [https://github.com/dekuNukem/Nintendo\_Switch\_Reverse\_Engineering](https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering)  
15. Reverse Engineering The Nintendo Switch Joy-Cons | Hackaday, 10月 16, 2025にアクセス、 [https://hackaday.com/2017/11/06/reverse-engineering-the-nintendo-switch-joy-cons/](https://hackaday.com/2017/11/06/reverse-engineering-the-nintendo-switch-joy-cons/)  
16. HID Protocol for Bluetooth / USB · Issue \#7 · dekuNukem/Nintendo\_Switch\_Reverse\_Engineering \- GitHub, 10月 16, 2025にアクセス、 [https://github.com/dekuNukem/Nintendo\_Switch\_Reverse\_Engineering/issues/7](https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/issues/7)  
17. JoyConの加速度センサーを取るための設定変更についての話 \- 忘れないうちに（旧）, 10月 16, 2025にアクセス、 [https://turtley-fms.hatenablog.com/entry/2018/03/24/055235](https://turtley-fms.hatenablog.com/entry/2018/03/24/055235)  
18. WebHID APIでJoy Conを使ってみる \- Zenn, 10月 16, 2025にアクセス、 [https://zenn.dev/thirdlf/scraps/7b16070edc89e1](https://zenn.dev/thirdlf/scraps/7b16070edc89e1)  
19. Questions about Joycon power and charging · Issue \#32 · dekuNukem/Nintendo\_Switch\_Reverse\_Engineering \- GitHub, 10月 16, 2025にアクセス、 [https://github.com/dekuNukem/Nintendo\_Switch\_Reverse\_Engineering/issues/32](https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/issues/32)  
20. Nintendo\_Switch\_Reverse\_Engineering/rumble\_data\_table.md at ..., 10月 16, 2025にアクセス、 [https://github.com/dekuNukem/Nintendo\_Switch\_Reverse\_Engineering/blob/master/rumble\_data\_table.md](https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/blob/master/rumble_data_table.md)  
21. KurtYilmaz/BetterJoyForCemu: Allows the Nintendo Switch Pro Controller and Joycons to be used with the Cemu Emulator and System-Wide \- GitHub, 10月 16, 2025にアクセス、 [https://github.com/KurtYilmaz/BetterJoyForCemu](https://github.com/KurtYilmaz/BetterJoyForCemu)  
22. Looking-Glass/JoyconLib: Joy-Con library for Unity. \- GitHub, 10月 16, 2025にアクセス、 [https://github.com/Looking-Glass/JoyconLib](https://github.com/Looking-Glass/JoyconLib)