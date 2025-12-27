const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

function createRoom(roomId, hostSocket, hostName) {
  rooms[roomId] = {
    host: hostSocket.id,
    hostName,
    players: {
      // name: { id, ready }
    },
    numbers: Array.from({ length: 50 }, (_, i) => i + 1),
    usedNumbers: [],
    leaderboard: [],
    started: false,
    startTime: null,
    lastDrawTime: 0  
  };
}
function emitRoomInfo(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    io.to(roomId).emit("roomInfo", {
      roomId,
      playerCount: Object.keys(room.players).length
    });
}
function getLobbyData() {
  return Object.entries(rooms).map(([roomId, room]) => ({
    roomId,
    players: Object.keys(room.players).length,
    started: room.started
  }));
}

io.on("connection", (socket) => {
 // 🔹 client ขอข้อมูล lobby
  socket.on("getLobby", () => {
    socket.emit("lobbyData", getLobbyData());
  });
  // ✅ ส่ง lobby ทันทีเมื่อมีคนเปิดหน้า
  const lobby = Object.entries(rooms).map(([roomId, room]) => ({
    roomId,
    players: Object.keys(room.players).length,
    started: room.started
  }));
  socket.emit("lobbyUpdate", lobby);
  /* ================= JOIN ROOM ================= */
  socket.on("joinRoom", ({ roomId, name }) => {
    if (!rooms[roomId]) {
      createRoom(roomId, socket, name);
    }

    const room = rooms[roomId];

    if (room.players[name]) {
      socket.emit("errorMsg", "ชื่อนี้ถูกใช้แล้ว");
      return;
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerName = name;

    const isWaiting = room.started === true;

    room.players[name] = {
      id: socket.id,
      ready: false,
      waiting: isWaiting   // 👈 สำคัญ
    };

    socket.emit("host", socket.id === room.host);
    socket.emit("history", room.usedNumbers);

    if (isWaiting) {
      socket.emit("waiting"); // 👈 แจ้ง client
    }

    io.to(roomId).emit("readyStatus", room.players);
    emitRoomInfo(roomId);
    broadcastLobby();
  });


  /* ================= READY ================= */
  socket.on("ready", () => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const player = room.players[socket.playerName];
    if (!player || player.waiting) return;

    player.ready = true;

    io.to(socket.roomId).emit("readyStatus", room.players);

    const allReady = Object.values(room.players).every(p => p.ready);
    if (allReady) {
      io.to(socket.roomId).emit("allReady");
    }
  });

  /* ================= START GAME ================= */
  socket.on("startGame", () => {
    const room = rooms[socket.roomId];
    if (!room || socket.id !== room.host) return;

    const allReady = Object.values(room.players).every(p => p.ready);
    if (!allReady) return;

    room.started = true;
    room.startTime = Date.now();

    io.to(socket.roomId).emit("gameStarted");
    broadcastLobby();
  });

  /* ================= DRAW NUMBER ================= */
  socket.on("drawAnimated", () => {
    const room = rooms[socket.roomId];
    if (!room || socket.id !== room.host || !room.started) return;
    if (room.numbers.length === 0) return;

    const now = Date.now();
    if (now - room.lastDrawTime < 5000) {
      socket.emit(
        "errorMsg",
        `⏳ กรุณารอ ${(5 - Math.floor((now - room.lastDrawTime) / 1000))} วินาที`
      );
      return;
    }

    room.lastDrawTime = now;

    let count = 0;
    const interval = setInterval(() => {
      const fake = Math.floor(Math.random() * 50) + 1;
      io.to(socket.roomId).emit("rolling", fake);
      count++;

      if (count >= 15) {
        clearInterval(interval);
        const index = Math.floor(Math.random() * room.numbers.length);
        const number = room.numbers.splice(index, 1)[0];
        room.usedNumbers.push(number);
        io.to(socket.roomId).emit("number", number);
      }
    }, 100);
  });


  /* ================= BINGO ================= */
  socket.on("bingo", (data) => {
    const room = rooms[socket.roomId];
    if (!room || !room.started) return;

    const player = room.players[socket.playerName];
    if (!player || player.waiting) return; // 👈 กันคนเข้ากลางเกม

    const timeUsed = Math.floor((Date.now() - room.startTime) / 1000);

    room.leaderboard.push({
      name: socket.playerName,
      time: timeUsed
    });
    // 👑 ผู้ชนะเป็น Host รอบถัดไป
    room.host = socket.id;
    // ⭐ Host ใหม่พร้อมอัตโนมัติ
    Object.entries(room.players).forEach(([name, p]) => {
      p.ready = (p.id === socket.id);
    });
    room.leaderboard.sort((a,b)=>a.time-b.time);

    io.to(socket.roomId).emit("winner", {
      name: socket.playerName,
      time: timeUsed,
      leaderboard: room.leaderboard.slice(0,5),
      winBoard: data.board,
      winLine: data.winLine   // 🔥 ส่งเส้นที่ชนะ
    });

  

    // 🔑 แจ้งทุกคนว่า host เปลี่ยนแล้ว
    io.to(socket.roomId).emit("newHost", room.host);

    // 🔑 sync สถานะ ready
    io.to(socket.roomId).emit("readyStatus", room.players);

    // 🔑 แจ้ง host โดยตรง (กัน client state เพี้ยน)
    io.to(room.host).emit("host", true);
    io.emit("lobbyData", getLobbyData());

    room.started = false;
  });



  /* ================= HOST RESET (PLAY AGAIN) ================= */
  socket.on("requestReset", () => {
    const room = rooms[socket.roomId];
    if (!room || socket.id !== room.host) return;

    room.usedNumbers = [];
    room.numbers = Array.from({ length: 50 }, (_, i) => i + 1);
    room.started = false;
    room.startTime = null;

    Object.values(room.players).forEach(p => {
      p.ready = false;
      p.waiting = false; // 👈 สำคัญ
    });
    io.emit("lobbyData", getLobbyData());
    io.to(socket.roomId).emit("resetGame");
    io.to(socket.roomId).emit("readyStatus", room.players);
    io.to(socket.roomId).emit("newHost", room.host);
    broadcastLobby();
  });

  /* ================= LEAVE ROOM ================= */
  socket.on("leaveRoom", () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    delete room.players[socket.playerName];
    socket.leave(roomId);

    if (socket.id === room.host) {
      const next = Object.values(room.players)[0];
      if (next) {
        room.host = next.id;
        io.to(roomId).emit("newHost", next.id);
      } else {
        delete rooms[roomId];
        return;
      }
    }
    io.emit("lobbyData", getLobbyData());
    io.to(roomId).emit("readyStatus", room.players);
    emitRoomInfo(roomId);
    broadcastLobby();
  });

  /* ================= DISCONNECT ================= */
  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    delete room.players[socket.playerName];

    if (socket.id === room.host) {
      const next = Object.values(room.players)[0];
      if (next) {
        room.host = next.id;
        io.to(roomId).emit("newHost", next.id);
      } else {
        delete rooms[roomId];
        return;
      }
    }
    io.emit("lobbyData", getLobbyData());
    io.to(roomId).emit("readyStatus", room.players);
    emitRoomInfo(roomId);
    broadcastLobby();
  });

  /* ==================== CHAT =====================*/
  socket.on("chat", msg => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    // กันข้อความว่าง / ยาวเกิน
    if (!msg || msg.trim().length === 0 || msg.length > 200) return;

    io.to(roomId).emit("chat", {
      name: socket.playerName,
      text: msg.trim(),
      time: Date.now()
    });
  });

});

function broadcastLobby() {
  const lobby = Object.entries(rooms).map(([roomId, room]) => ({
    roomId,
    players: Object.keys(room.players).length,
    started: room.started
  }));

  io.emit("lobbyUpdate", lobby);
}


server.listen(5555, () => {
  console.log("Server running http://localhost:5555");
});
