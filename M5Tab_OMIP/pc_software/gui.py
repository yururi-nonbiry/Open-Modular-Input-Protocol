import io
import json
import os
import queue
import serial
import serial.tools.list_ports
import threading
import time
import tkinter as tk
from tkinter import ttk

from PIL import Image, ImageTk
from pynput import keyboard
from tkinterdnd2 import DND_FILES, TkinterDnD

import omip_pb2

# --- Constants ---
CHUNK_SIZE = 190
ACK_READY = b"\x06"
ACK_ERROR = b"\x15"
ACK_TIMEOUT_SEC = 2.0
CONFIG_FILE = "gui_config.json"


class App(TkinterDnD.Tk):
    def __init__(self):
        super().__init__()
        self.title("M5Tab OMIP 設定ツール")
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

        # --- Class variables ---
        self.serial_connection = None
        self.serial_thread = None
        self.stop_thread = False
        self.serial_queue = queue.Queue()
        self.ack_queue = queue.Queue()
        self.keyboard = keyboard.Controller()

        # --- Data Structure for Page Configurations ---
        self.page_configs = {p: [{'icon': None, 'image': None, 'action': ''} for _ in range(18)] for p in range(1, 6)}

        # --- Load Config ---
        self.load_config()

        # --- Top Frame for Connection UI ---
        connection_frame = ttk.Frame(self, padding="10")
        connection_frame.pack(fill="x", side="top")

        ttk.Label(connection_frame, text="シリアルポート:").pack(side="left", padx=(0, 5))

        self.port_variable = tk.StringVar()
        self.port_combobox = ttk.Combobox(connection_frame, textvariable=self.port_variable, width=15, state="readonly")
        self.port_combobox.pack(side="left")
        
        self.refresh_button = ttk.Button(connection_frame, text="更新", command=self.refresh_ports)
        self.refresh_button.pack(side="left", padx=5)
        self.connect_button = ttk.Button(connection_frame, text="接続", command=self.on_connect)
        self.connect_button.pack(side="left", padx=5)

        self.refresh_ports() # Initial port scan

        # --- Main layout frames ---
        main_frame = ttk.Frame(self)
        main_frame.pack(fill="both", expand=True, padx=10, pady=10)
        
        header_frame = ttk.Frame(main_frame)
        header_frame.pack(fill="x", side="top", pady=(0, 5))
        
        body_frame = ttk.Frame(main_frame)
        body_frame.pack(fill="both", expand=True)
        
        sidebar_frame = ttk.Frame(body_frame)
        sidebar_frame.pack(fill="y", side="left", padx=(0, 10))
        
        grid_frame = ttk.Frame(body_frame)
        grid_frame.pack(fill="both", expand=True)

        footer_frame = ttk.Frame(main_frame)
        footer_frame.pack(fill="x", side="bottom", pady=(5, 0))

        # --- Header ---
        ttk.Label(header_frame, text="M5Tab OMIP 設定ツール", font=("TkDefaultFont", 14, "bold")).pack(side="left")
        settings_button = ttk.Button(header_frame, text="設定")
        settings_button.pack(side="right")

        # --- Sidebar (Volume Control) ---
        ttk.Label(sidebar_frame, text="音量").pack()
        self.volume_scale = ttk.Scale(sidebar_frame, orient="vertical", from_=100, to=0)
        self.volume_scale.pack(expand=True, fill="y", pady=5)
        self.volume_scale.set(75) # Default value

        # --- Grid (Main Area) ---
        self.grid_cells = []
        for r in range(3):
            row_list = []
            grid_frame.grid_rowconfigure(r, weight=1)
            for c in range(6):
                grid_frame.grid_columnconfigure(c, weight=1)
                cell_frame = tk.Frame(grid_frame, relief="solid", borderwidth=1)
                cell_frame.grid(row=r, column=c, padx=5, pady=5, sticky="nsew")
                
                icon_label = tk.Label(cell_frame, text="", compound="top")
                icon_label.pack(expand=True, fill="both", pady=(5,0))
                
                action_label = tk.Label(cell_frame, text="", wraplength=80, font=("-size", 8))
                action_label.pack(side="bottom", fill="x", pady=(0,5))

                # Bind click to open action dialog
                cell_frame.bind("<Button-1>", lambda e, r=r, c=c: self.open_action_dialog(r, c))
                icon_label.bind("<Button-1>", lambda e, r=r, c=c: self.open_action_dialog(r, c))
                action_label.bind("<Button-1>", lambda e, r=r, c=c: self.open_action_dialog(r, c))

                # Drag and Drop bindings
                cell_frame.drop_target_register(DND_FILES)
                cell_frame.dnd_bind('<<Drop>>', lambda e, r=r, c=c: self.on_drop(e, r, c))
                icon_label.drop_target_register(DND_FILES)
                icon_label.dnd_bind('<<Drop>>', lambda e, r=r, c=c: self.on_drop(e, r, c))
                
                row_list.append({'frame': cell_frame, 'icon': icon_label, 'action': action_label})
            self.grid_cells.append(row_list)

        # --- Footer (Page Navigation) ---
        self.page_number = 1
        self.total_pages = 5 # Example total pages
        self.page_label = ttk.Label(footer_frame, text=f"ページ {self.page_number} / {self.total_pages}")
        
        prev_button = ttk.Button(footer_frame, text="<", command=self.prev_page)
        next_button = ttk.Button(footer_frame, text=">", command=self.next_page)

        prev_button.pack(side="left", padx=5)
        self.page_label.pack(side="left")
        next_button.pack(side="left", padx=5)

        # --- Status Bar ---
        self.status_label = ttk.Label(self, text="ステータス: 切断", padding="5", anchor="w")
        self.status_label.pack(side="bottom", fill="x")

        self.update_page_display() # Initial page load
        self._process_queue() # Start queue processor

    def _execute_action(self, action_string):
        print(f"アクションを実行します: {action_string}")
        # Simple parsing for now, e.g., "ctrl+c"
        keys = action_string.lower().split('+')
        try:
            for key in keys:
                # Map string to pynput Key object if necessary
                special_key = getattr(keyboard.Key, key, None)
                if special_key:
                    self.keyboard.press(special_key)
                else:
                    self.keyboard.press(key)
            # Release in reverse order
            for key in reversed(keys):
                special_key = getattr(keyboard.Key, key, None)
                if special_key:
                    self.keyboard.release(special_key)
                else:
                    self.keyboard.release(key)
        except Exception as e:
            print(f"キーの組み合わせの実行に失敗しました: {e}")

    def _flash_cell(self, row, col):
        cell_frame = self.grid_cells[row][col]['frame']
        original_color = cell_frame.cget("background")
        cell_frame.config(background="#a0a0a0") # Highlight color
        self.after(100, lambda: cell_frame.config(background=original_color))

    def _serial_reader(self):
        print("シリアルリーダーのスレッドが開始されました。")
        while not self.stop_thread:
            try:
                if self.serial_connection and self.serial_connection.is_open:
                    first_byte = self.serial_connection.read(1)
                    if not first_byte:
                        continue
                    if first_byte in (ACK_READY, ACK_ERROR):
                        self.ack_queue.put(first_byte)
                        continue
                    if first_byte != b'~':
                        # Ignore stray bytes that are neither ACK nor frame start
                        continue

                    length_byte = self.serial_connection.read(1)
                    if not length_byte:
                        continue
                    length = length_byte[0]

                    data = self.serial_connection.read(length)
                    if len(data) == length:
                        wrapper_msg = omip_pb2.WrapperMessage()
                        wrapper_msg.ParseFromString(data)
                        self.serial_queue.put(wrapper_msg)
                else:
                    time.sleep(0.1) # Avoid busy-waiting if disconnected
            except serial.SerialException as e:
                print(f"シリアルリーダーのスレッドでエラーが発生しました: {e}")
                self.stop_thread = True # Stop thread on error
                self.serial_queue.put("serial_error")
            except Exception as e:
                print(f"リーダーのスレッドでエラーが発生しました: {e}")
        print("シリアルリーダーのスレッドが停止しました。")

    def _process_queue(self):
        try:
            while not self.serial_queue.empty():
                msg = self.serial_queue.get_nowait()

                if msg == "serial_error":
                    self.disconnect()
                    self.set_status("ステータス: デバイスが切断されたか、エラーが発生しました。")
                    break

                if msg.HasField("input_digital"):
                    port_id = msg.input_digital.port_id
                    state = msg.input_digital.state
                    print(f"InputDigital 受信: ポート={port_id}, 状態={state}")
                    
                    if state: # Only act on press, not release
                        if 0 <= port_id < 18:
                            row, col = divmod(port_id, 6)
                            self._flash_cell(row, col)
                            action = self.page_configs[self.page_number][port_id]['action']
                            if action:
                                self._execute_action(action)
                        elif port_id == 19: # Next page
                            self.next_page()
                        elif port_id == 20: # Prev page
                            self.prev_page()
                
                elif msg.HasField("input_analog"):
                    port_id = msg.input_analog.port_id
                    value = msg.input_analog.value
                    print(f"InputAnalog 受信: ポート={port_id}, 値={value:.2f}")

                    if port_id == 18: # Volume slider
                        # Assuming the scale is 0-100
                        self.volume_scale.set(value * 100)

        except queue.Empty:
            pass
        finally:
            self.after(100, self._process_queue) # Poll queue every 100ms

    def open_action_dialog(self, row, col):
        dialog = tk.Toplevel(self)
        dialog.title(f"ポート {row*6+col} のアクション設定")
        dialog.geometry("300x100")
        dialog.transient(self)
        dialog.grab_set()

        ttk.Label(dialog, text="アクション (例: 'ctrl+c'):").pack(padx=10, pady=5)
        
        action_var = tk.StringVar()
        cell_index = row * 6 + col
        current_action = self.page_configs[self.page_number][cell_index]['action']
        action_var.set(current_action)
        
        entry = ttk.Entry(dialog, textvariable=action_var, width=40)
        entry.pack(padx=10, pady=5)
        entry.focus_set()

        def save_action():
            new_action = action_var.get()
            self.page_configs[self.page_number][cell_index]['action'] = new_action
            self.update_page_display()
            dialog.destroy()

        button_frame = ttk.Frame(dialog)
        button_frame.pack(pady=5)
        save_button = ttk.Button(button_frame, text="保存", command=save_action)
        save_button.pack(side="left", padx=5)
        cancel_button = ttk.Button(button_frame, text="キャンセル", command=dialog.destroy)
        cancel_button.pack(side="left", padx=5)

    def prev_page(self):
        if self.page_number > 1:
            self.page_number -= 1
            self.update_page_display()

    def next_page(self):
        if self.page_number < self.total_pages:
            self.page_number += 1
            self.update_page_display()

    def update_page_display(self):
        self.page_label.config(text=f"ページ {self.page_number} / {self.total_pages}")
        print(f"Loading page {self.page_number}")

        config = self.page_configs[self.page_number]
        for r in range(3):
            for c in range(6):
                cell_index = r * 6 + c
                cell_config = config[cell_index]
                cell_ui = self.grid_cells[r][c]

                cell_ui['action'].config(text=cell_config['action'] or f"ポート {cell_index}")
                if cell_config['image']:
                    cell_ui['icon'].config(image=cell_config['image'])
                    # Keep the image reference to prevent garbage collection
                    cell_ui['icon'].image = cell_config['image'] 
                else:
                    cell_ui['icon'].config(image='')
                    cell_ui['icon'].image = None
        
        # Sync icons to device if connected
        if self.serial_connection and self.serial_connection.is_open:
            self.sync_page_to_device()

    def sync_page_to_device(self):
        self.set_status(f"ページ {self.page_number} をデバイスに同期中...")
        config = self.page_configs[self.page_number]
        for i, cell_config in enumerate(config):
            icon_path = cell_config.get('icon')
            if icon_path and os.path.exists(icon_path):
                screen_id = i
                try:
                    self.send_image_to_device(icon_path, screen_id)
                except Exception as e:
                    self.set_status(f"ポート {i} のアイコン同期エラー: {e}")
                    # Stop syncing on error to avoid flooding with failures
                    break 
        self.set_status(f"ページ {self.page_number} 同期完了。")


    def refresh_ports(self):
        ports = [port.device for port in serial.tools.list_ports.comports()]
        self.port_combobox['values'] = ports
        if ports:
            self.port_variable.set(ports[0])
        else:
            self.port_variable.set("")
        print("シリアルポートを更新しました。")

    def on_connect(self):
        if self.serial_connection is None:
            port = self.port_variable.get()
            if not port:
                self.set_status("ステータス: ポートが選択されていません。")
                return
            try:
                self.serial_connection = serial.Serial(port, 115200, timeout=1)
                self.set_status(f"ステータス: {port} に接続しました")
                self.connect_button.config(text="切断")
                self.port_combobox.config(state="disabled")
                self.refresh_button.config(state="disabled")
                
                # Start the serial reader thread
                self.stop_thread = False
                self.serial_thread = threading.Thread(target=self._serial_reader)
                self.serial_thread.daemon = True
                self.serial_thread.start()

                print(f"{port} に正常に接続しました")
            except serial.SerialException as e:
                self.set_status(f"ステータス: {port} への接続に失敗しました")
                print(f"エラー: {e}")
        else:
            self.disconnect()

    def disconnect(self):
        # Signal the thread to stop
        if self.serial_thread:
            self.stop_thread = True
            self.serial_thread.join(timeout=1) # Wait for the thread to finish
            self.serial_thread = None

        if self.serial_connection:
            try:
                self.serial_connection.close()
            except Exception as e:
                print(f"切断時にエラーが発生しました: {e}")
        self.serial_connection = None
        self.set_status("ステータス: 切断")
        self.connect_button.config(text="接続")
        self.port_combobox.config(state="readonly")
        self.refresh_button.config(state="normal")
        print("切断しました。")

    def on_drop(self, event, row, col):
        filepath = event.data.strip('{}')
        print(f"セル ({row}, {col}) に '{filepath}' がドロップされました")

        allowed_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp']
        _, extension = os.path.splitext(filepath)
        if extension.lower() not in allowed_extensions:
            print(f"スキップ: サポートされていない画像ファイルです ({extension})。")
            return

        try:
            image = Image.open(filepath)
            image = image.resize((80, 80), Image.Resampling.LANCZOS) # Smaller resize
            photo = ImageTk.PhotoImage(image)
            
            # Save image and path to the data structure
            cell_index = row * 6 + col
            self.page_configs[self.page_number][cell_index]['icon'] = filepath
            self.page_configs[self.page_number][cell_index]['image'] = photo

            # Update the entire page display to reflect the new icon
            self.update_page_display()

        except Exception as e:
            print(f"画像の処理中にエラー: {e}")
            self.set_status(f"エラー: 画像 {os.path.basename(filepath)} を読み込めませんでした")
            return

        if self.serial_connection and self.serial_connection.is_open:
            screen_id = row * 6 + col
            self.send_image_to_device(filepath, screen_id)
        else:
            self.set_status("情報: GUIに画像を設定しましたが、デバイスに接続されていません。")

    def send_image_to_device(self, image_path, screen_id):
        self.set_status(f"{os.path.basename(image_path)} を送信中...")
        try:
            img = Image.open(image_path)
            jpeg_buffer = io.BytesIO()
            img.save(jpeg_buffer, format='JPEG', quality=85)
            image_data = jpeg_buffer.getvalue()
            total_size = len(image_data)

            self._clear_ack_queue()

            offset = 0
            while offset < total_size:
                chunk = image_data[offset:offset + CHUNK_SIZE]
                is_last = (offset + len(chunk)) == total_size
                
                progress = int(((offset + len(chunk)) / total_size) * 100)
                self.set_status(f"送信中... {progress}%")

                feedback_msg = omip_pb2.FeedbackImage(
                    screen_id=screen_id,
                    format=omip_pb2.FeedbackImage.ImageFormat.JPEG,
                    total_size=total_size,
                    chunk_offset=offset,
                    chunk_data=chunk,
                    is_last_chunk=is_last
                )
                wrapper_msg = omip_pb2.WrapperMessage(feedback_image=feedback_msg)
                serialized_msg = wrapper_msg.SerializeToString()
                
                self._send_serial_data(serialized_msg)
                self._wait_for_ack()
                
                offset += len(chunk)

            self.set_status(f"{os.path.basename(image_path)} の送信に成功しました。")

        except Exception as e:
            print(f"画像の送信に失敗しました: {e}")
            self.set_status(f"エラー: 画像の送信に失敗しました。")

    def _send_serial_data(self, data):
        if not self.serial_connection or not self.serial_connection.is_open:
            raise serial.SerialException("Device not connected.")
        self.serial_connection.write(b'~')
        self.serial_connection.write(bytes([len(data)]))
        self.serial_connection.write(data)

    def _clear_ack_queue(self):
        while not self.ack_queue.empty():
            try:
                self.ack_queue.get_nowait()
            except queue.Empty:
                break

    def _wait_for_ack(self):
        if not self.serial_connection or not self.serial_connection.is_open:
            raise serial.SerialException("デバイスが接続されていません。")
        deadline = time.monotonic() + ACK_TIMEOUT_SEC
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            byte = None
            try:
                byte = self.ack_queue.get(timeout=min(remaining, 0.1))
            except queue.Empty:
                pass
            if byte is None and self.serial_connection.in_waiting > 0:
                byte = self.serial_connection.read(1)
            if not byte:
                continue
            if byte == ACK_READY:
                return
            if byte == ACK_ERROR:
                raise RuntimeError("デバイスがエラーを報告しました。")
        raise TimeoutError("デバイスからのACK待機中にタイムアウトしました。")

    def set_status(self, message):
        self.status_label.config(text=message)
        self.update_idletasks() # Force GUI update

    def save_config(self):
        print("設定を保存しています...")
        save_data = {}
        for page_num, configs in self.page_configs.items():
            save_data[page_num] = []
            for config in configs:
                # Only save the file path (icon) and the action string
                save_data[page_num].append({
                    'icon': config['icon'],
                    'action': config['action']
                })
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump(save_data, f, indent=4)
            print("設定を保存しました。")
        except Exception as e:
            print(f"設定の保存中にエラー: {e}")
            self.set_status(f"エラー: 設定を保存できませんでした。")

    def load_config(self):
        print("設定を読み込んでいます...")
        try:
            with open(CONFIG_FILE, 'r') as f:
                loaded_data = json.load(f)
            
            for page_num_str, configs in loaded_data.items():
                page_num = int(page_num_str)
                if page_num not in self.page_configs:
                    continue
                
                for i, config in enumerate(configs):
                    if i < len(self.page_configs[page_num]):
                        self.page_configs[page_num][i]['action'] = config.get('action', '')
                        icon_path = config.get('icon')
                        if icon_path and os.path.exists(icon_path):
                            self.page_configs[page_num][i]['icon'] = icon_path
                            try:
                                image = Image.open(icon_path)
                                image = image.resize((80, 80), Image.Resampling.LANCZOS)
                                photo = ImageTk.PhotoImage(image)
                                self.page_configs[page_num][i]['image'] = photo
                            except Exception as e:
                                print(f"画像 {icon_path} の読み込みエラー: {e}")
                                self.page_configs[page_num][i]['image'] = None # Clear if image fails to load
                        else:
                            self.page_configs[page_num][i]['icon'] = None
                            self.page_configs[page_num][i]['image'] = None

            print("設定を読み込みました。")
        except FileNotFoundError:
            print("設定ファイルが見つかりません。デフォルトで起動します。")
        except Exception as e:
            print(f"設定の読み込み中にエラー: {e}")
            self.set_status("エラー: 設定を読み込めませんでした。")

    def on_closing(self):
        self.save_config()
        self.disconnect()
        self.destroy()

if __name__ == "__main__":
    app = App()
    app.mainloop()
