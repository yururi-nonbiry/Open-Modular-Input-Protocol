#include <M5Unified.h> // M5Stackデバイス用の統合ライブラリをインクルード

// setup()関数は、デバイスの起動時またはリセット時に一度だけ実行されます。
void setup() {
  // デバイスのデフォルト設定構造体を取得します。
  auto cfg = M5.config();
  
  // デフォルト設定でM5Tabを初期化します。
  // これにより、ディスプレイ、電源管理、その他の周辺機器がセットアップされます。
  M5.begin(cfg);

  // ディスプレイを設定します。
  M5.Display.setTextSize(3); // 見やすくするためにテキストサイズを大きくします。
  M5.Display.setCursor(10, 10); // テキストの開始位置を設定します。
  M5.Display.print("Hello, M5Tab!"); // LCD画面にメッセージを表示します。

  // デバッグと監視のためにシリアル通信を初期化します。
  // ボーレートはplatformio.iniの'monitor_speed'と一致させる必要があります。
  Serial.begin(115200);
  Serial.println("M5Tab Initialized. Starting loop...");
}

// loop()関数は、setup()が終了した後に繰り返し実行されます。
void loop() {
  // ループ内でM5.update()を呼び出すのが良い習慣です。
  // これにより、ボタンの状態の読み取りなどのタスクが処理されます。
  M5.update();

  // ループ回数を追跡するための静的変数を作成します。
  // 'static'により、変数はループの反復間でその値を保持します。
  static uint32_t count = 0;
  
  // 現在のループ回数をシリアルモニタに出力します。
  // これはプログラムが実行されていることを確認するのに役立ちます。
  Serial.printf("Loop count: %d\n", count++);

  // 次の反復の前に1000ミリ秒（1秒）待ちます。
  delay(1000);
}