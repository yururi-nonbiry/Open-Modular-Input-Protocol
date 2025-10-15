import { io } from "socket.io-client";

// The URL of the Python backend server
const URL = "http://localhost:8000";

export const socket = io(URL, {
  autoConnect: true, // Automatically connect on initialization
});
