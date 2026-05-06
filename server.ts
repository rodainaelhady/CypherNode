import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

// --- Room Tracking (in-memory only, no persistence) ---
const rooms = new Map<string, Set<string>>();

function getRoomPeerCount(roomId: string): number {
  return rooms.get(roomId)?.size ?? 0;
}

function addToRoom(roomId: string, socketId: string): number {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId)!.add(socketId);
  return rooms.get(roomId)!.size;
}

function removeFromRoom(roomId: string, socketId: string): number {
  const room = rooms.get(roomId);
  if (!room) return 0;
  room.delete(socketId);
  if (room.size === 0) {
    rooms.delete(roomId);
  }
  return room.size;
}

// Track which room each socket is in (for cleanup on disconnect)
const socketRoomMap = new Map<string, string>();

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const PORT = parseInt(process.env.PORT || "3000", 10);

  // --- Socket.IO Relay Logic ---
  io.on("connection", (socket: Socket) => {
    const ip = socket.handshake.address;
    console.log(`[CONNECT] ${socket.id} from ${ip}`);

    // Join a session room
    socket.on("join-session", (sessionId: string) => {
      // Leave previous room if any
      const prevRoom = socketRoomMap.get(socket.id);
      if (prevRoom) {
        socket.leave(prevRoom);
        const count = removeFromRoom(prevRoom, socket.id);
        socket.to(prevRoom).emit("peer-left", count);
      }

      socket.join(sessionId);
      const count = addToRoom(sessionId, socket.id);
      socketRoomMap.set(socket.id, sessionId);

      // Notify everyone in the room (including new peer)
      io.to(sessionId).emit("peer-joined", count);
      console.log(
        `[JOIN] ${socket.id} → room "${sessionId}" (peers: ${count})`
      );
    });

    // Relay: Receiver → Sender (RSA public key)
    socket.on(
      "send-public-key",
      ({
        sessionId,
        publicKey,
      }: {
        sessionId: string;
        publicKey: JsonWebKey;
      }) => {
        console.log(
          `[RELAY] public-key → room "${sessionId}" from ${socket.id}`
        );
        socket.to(sessionId).emit("receive-public-key", publicKey);
      }
    );

    // Relay: Sender → Receiver (encrypted AES session key)
    socket.on(
      "send-session-key",
      ({
        sessionId,
        encryptedKey,
      }: {
        sessionId: string;
        encryptedKey: string;
      }) => {
        console.log(
          `[RELAY] session-key → room "${sessionId}" from ${socket.id}`
        );
        socket.to(sessionId).emit("receive-session-key", encryptedKey);
      }
    );

    // Relay: Sender → Receiver (encrypted file data)
    socket.on(
      "send-file-chunk",
      ({
        sessionId,
        chunk,
        fileName,
        type,
      }: {
        sessionId: string;
        chunk: string;
        fileName: string;
        type: string;
      }) => {
        console.log(
          `[RELAY] file-chunk → room "${sessionId}" from ${socket.id} (${fileName}, ${type})`
        );
        socket.to(sessionId).emit("receive-file-chunk", {
          chunk,
          fileName,
          type,
        });
      }
    );

    // Disconnect: clean up room tracking
    socket.on("disconnect", (reason) => {
      const roomId = socketRoomMap.get(socket.id);
      if (roomId) {
        const count = removeFromRoom(roomId, socket.id);
        socket.to(roomId).emit("peer-left", count);
        socketRoomMap.delete(socket.id);
        console.log(
          `[DISCONNECT] ${socket.id} from room "${roomId}" (remaining: ${count}, reason: ${reason})`
        );
      } else {
        console.log(
          `[DISCONNECT] ${socket.id} (no room, reason: ${reason})`
        );
      }
    });
  });

  // --- Vite Dev Middleware or Static Production Build ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[CYPHER.NODE] Relay server running on http://localhost:${PORT}`);
    console.log(`[CYPHER.NODE] No data is stored. All relay is in-memory only.`);
  });
}

startServer();
