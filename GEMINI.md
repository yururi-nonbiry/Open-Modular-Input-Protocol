## 言語
このアプリケーションは日本語としてください
ユーザーへのメッセージは日本語で送信してください

## コマンド実行について
コマンドを実行するときは docker compose run を使用してください

## 仕様について
readme.mdに仕様が書かれているので最初に把握してください
readme.mdに不足している内容があったら修正してください

## Python環境について
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

## タスクの管理について
task.mdにタスクを記載してください