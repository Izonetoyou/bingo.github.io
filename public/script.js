const socket = io();
const BINGO_LINES = [
  // แนวนอน
  [0,1,2,3,4],
  [5,6,7,8,9],
  [10,11,12,13,14],
  [15,16,17,18,19],
  [20,21,22,23,24],

  // แนวตั้ง
  [0,5,10,15,20],
  [1,6,11,16,21],
  [2,7,12,17,22],
  [3,8,13,18,23],
  [4,9,14,19,24],

  // ทแยง
  [0,6,12,18,24],
  [4,8,12,16,20],

  // ⭐ กติกาใหม่
  [0,4,20,24],     // มุมนอก
  [6,8,16,18]      // มุมใน
];

let board = [];
let calledNumbers = [];
let isHost = false;
let gameStarted = false;
let timerInterval = null;
let hasWon = false;
let drawCooldown = false;
let chatOpen = false;
let isWaiting = false;
let confettiAnimId = null;
let fireworksAnimId = null;

/* ================= SOUND ================= */
const sounds = {
  draw: new Audio("/sound/draw.mp3"),
  start: new Audio("/sound/start.mp3"),
  bingo: new Audio("/sound/bingo.mp3"),
  tick: new Audio("/sound/tick.mp3")
};
sounds.tick.loop = true;      // ⭐ ให้ tick loop
sounds.tick.volume = 0.4;
// ป้องกันเล่นซ้อน
Object.values(sounds).forEach(a => {
  a.preload = "auto";
  a.volume = 0.6;
});



/* ================= JOIN ================= */
function join() {
  const name = document.getElementById("name").value;
  const room = document.getElementById("room").value;

  if (!name || !room) {
    alert("กรุณากรอกชื่อและรหัสห้อง");
    return;
  }

  socket.playerName = name;
  socket.emit("joinRoom", { roomId: room, name });

  // ✅ ซ่อน Lobby
  document.getElementById("lobby").style.display = "none";

  // ✅ แสดง Game
  document.getElementById("game").style.display = "block";

  // ปุ่มออก
  document.getElementById("leaveBtn").style.display = "inline-block";

  createBoard();
}

socket.on("joined", () => {
  document.getElementById("join").style.display = "none";
});

/* ================= BOARD ================= */
function createBoard() {
  const pool = Array.from({ length: 50 }, (_, i) => i + 1)
    .sort(() => Math.random() - 0.5)
    .slice(0, 25); // เอาแค่ 25 ตัว

  const boardDiv = document.getElementById("board");
  boardDiv.innerHTML = "";
  board = [];

  pool.forEach((n, i) => {
    const c = document.createElement("div");
    c.className = "cell";

    if (i === 12) {
      // ⭐ ช่อง FREE ตรงกลาง
      c.innerText = "FREE";
      c.classList.add("mark", "free");
    } else {
      c.innerText = n;
      c.onclick = (e) => mark(c, e);
    }

    boardDiv.appendChild(c);
    board.push(c);
  });

}


function mark(cell, e) {
  if (!gameStarted) return;
  if (cell.classList.contains("free")) return; // 👈 กัน FREE
  e.preventDefault(); // 👈 สำคัญสำหรับมือถือ
  const n = parseInt(cell.innerText);
  if (!calledNumbers.includes(n)) {
    alert("🚨 โกง! เลขยังไม่ออก");
    return;
  }

  cell.classList.toggle("mark");
  checkBingo();
}

/* ================= READY ================= */
function ready() {
  if (isWaiting) {
    alert("⏳ กรุณารอให้เกมจบก่อน");
    return;
  }
  socket.emit("ready");
}


socket.on("readyStatus", players => {
  const div = document.getElementById("readyStatus");
  if (!div) return;

  div.innerHTML = Object.keys(players)
    .map(name =>
      `${players[name].ready ? "✅" : "⏳"} ${name}`
    )
    .join("<br>");
});

socket.on("allReady", () => {
  alert("🎉 ทุกคนพร้อมแล้ว! Host เริ่มเกมได้");
});

/* ================= HOST ================= */
socket.on("host", flag => {
  isHost = flag;

  document.getElementById("role").innerText =
    flag ? "👑 Host" : "👤 Player";

  const startBtn = document.getElementById("startBtn");
  const drawBtn = document.getElementById("drawBtn");

  if (flag) {
    startBtn.style.display = "inline-block";
    drawBtn.style.display = "inline-block";
  } else {
    startBtn.style.display = "none";
    drawBtn.style.display = "none";
  }
});


socket.on("newHost", id => {
  isHost = socket.id === id;

  document.getElementById("role").innerText =
    isHost ? "👑 Host" : "👤 Player";

  const startBtn = document.getElementById("startBtn");
  const drawBtn = document.getElementById("drawBtn");

  if (isHost) {
    startBtn.style.display = "inline-block";
    drawBtn.style.display = "inline-block";
  } else {
    startBtn.style.display = "none";
    drawBtn.style.display = "none";
  }
});


/* ================= GAME FLOW ================= */
function startGame() {
  socket.emit("startGame");
}

function draw() {
  if (drawCooldown) return;
  playSound("draw");   // 🔊 เสียงสุ่ม
  drawCooldown = true;
  socket.emit("drawAnimated");

  const btn = document.getElementById("drawBtn");
  let t = 5;
  btn.innerText = `⏳ รอ ${t}`;

  const cd = setInterval(() => {
    t--;
    btn.innerText = `⏳ รอ ${t}`;
    if (t <= 0) {
      clearInterval(cd);
      btn.innerText = "🎰 สุ่มเลข";
      drawCooldown = false;
    }
  }, 1000);
}


socket.on("gameStarted", () => {
  calledNumbers = []; // ⭐ เพิ่ม
  playSound("start");
  gameStarted = true;
  startTimer();
  alert("🚦 เกมเริ่มแล้ว!");
});

/* ================= NUMBER ================= */
socket.on("rolling", n => {
  // 🔊 เล่น tick แค่ครั้งแรก
  if (soundEnabled && sounds.tick.paused) {
    sounds.tick.currentTime = 0;
    sounds.tick.play().catch(()=>{});
  }

  const cur = document.getElementById("current");
  if (cur) cur.innerText = "🎰 " + n;
});

socket.on("number", n => {
    // 🛑 หยุดเสียง tick
  sounds.tick.pause();
  sounds.tick.currentTime = 0;
  if (!gameStarted) return;
  
  const cur = document.getElementById("current");
  if (!cur) return;

  calledNumbers.push(n);
  cur.innerText = "เลขที่ออก: " + n;

  const hist = document.getElementById("history");
  if (hist) hist.innerText = calledNumbers.join(", ");
});

/* ================= BINGO ================= */
function checkBingo() {
  if (!gameStarted || isWaiting || hasWon) return;

  for (let line of BINGO_LINES) {
    if (line.every(i => board[i].classList.contains("mark"))) {
      hasWon = true;        // 🔒 ล็อกว่าชนะแล้ว
      gameStarted = false; // หยุดเกม

      socket.emit("bingo", {
        winLine: line,
        board: getBoardSnapshot()
      });

      break;
    }
  }
}


/* ================= PLAY AGAIN (HOST) ================= */
function playAgain() {
  console.log("PLAY AGAIN", { isHost, isWaiting });

  if (!isHost) {
    alert("เฉพาะ Host เท่านั้นที่เริ่มรอบใหม่ได้");
    return;
  }

  if (isWaiting) {
    alert("ยังไม่พร้อมเริ่มรอบใหม่");
    return;
  }

  socket.emit("requestReset");
}


/* ================= RESET GAME ================= */
socket.on("resetGame", () => {
  isWaiting = false;

  document.getElementById("board").style.opacity = "1";
  document.getElementById("board").style.pointerEvents = "auto";

  hasWon = false;
  calledNumbers = [];
  gameStarted = false;

  clearInterval(timerInterval);
  timerInterval = null;

  document.getElementById("history").innerText = "";
  document.getElementById("current").innerText = "";
  document.getElementById("timer").innerText = "⏱️ 00:00";

  createBoard();

  // 🔥 กลับจากหน้า Champion
  document.getElementById("champion").style.display = "none";
  document.getElementById("game").style.display = "block";
});

/* ================= LEAVE ROOM ================= */
function leaveRoom() {
  if (!confirm("ออกจากห้อง?")) return;

  socket.emit("leaveRoom");

  document.getElementById("game").style.display = "none";
  document.getElementById("lobby").style.display = "block";

  
}


/* ================= ERROR ================= */
socket.on("errorMsg", msg => {
  alert(msg);
  
});

/* ================= TIMER ================= */
function startTimer() {
  let start = Date.now();
  timerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000);
    const t = document.getElementById("timer");
    if (t) t.innerText = "⏱️ " + formatTime(s);
  }, 1000);
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* ================= CONFETTI ================= */
function startConfetti() {
  const canvas = document.getElementById("confetti");


  const ctx = canvas.getContext("2d");

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const gravity = 0.35;
  const wind = 0.02;
  const friction = 0.995;

  const colors = [
    "#ff1744", "#ff9100", "#ffea00",
    "#00e676", "#2979ff", "#d500f9"
  ];

  const pieces = Array.from({ length: 220 }).map(() => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height,
    w: Math.random() * 8 + 6,
    h: Math.random() * 14 + 8,
    vx: Math.random() * 4 - 2,
    vy: Math.random() * 3 + 2,
    rotation: Math.random() * 360,
    rotationSpeed: Math.random() * 8 - 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    life: Math.random() * 200 + 200
  }));

  function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    pieces.forEach(p => {
      p.vy += gravity;
      p.vx += wind;
      p.vx *= friction;
      p.vy *= friction;

      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.life--;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    // ลบชิ้นที่หมดอายุ
    for (let i = pieces.length - 1; i >= 0; i--) {
      if (pieces[i].life <= 0 || pieces[i].y > canvas.height + 50) {
        pieces.splice(i, 1);
      }
    }

    if (pieces.length > 0) {
      requestAnimationFrame(update);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  update();
}
function startFireworks() {
  const canvas = document.getElementById("fireworks");

  const ctx = canvas.getContext("2d");

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const gravity = 0.06;
  const fireworks = [];
  const particles = [];

  function randomColor() {
    const colors = [
      "#ff1744", "#ff9100", "#ffea00",
      "#00e676", "#2979ff", "#d500f9"
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function launchFirework() {
    fireworks.push({
      x: Math.random() * canvas.width,
      y: canvas.height,
      vx: Math.random() * 2 - 1,
      vy: -(Math.random() * 7 + 9),
      color: randomColor(),
      exploded: false
    });
  }

  function explode(fw) {
    for (let i = 0; i < 60; i++) {
      const angle = (Math.PI * 2 / 60) * i;
      const speed = Math.random() * 4 + 2;
      particles.push({
        x: fw.x,
        y: fw.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 80,
        color: fw.color
      });
    }
  }

  let frame = 0;

  function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ยิงพลุ
    if (frame % 25 === 0) {
      launchFirework();
    }

    // อัปเดตพลุ
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const fw = fireworks[i];
      fw.vy += gravity;
      fw.x += fw.vx;
      fw.y += fw.vy;

      ctx.fillStyle = fw.color;
      ctx.beginPath();
      ctx.arc(fw.x, fw.y, 3, 0, Math.PI * 2);
      ctx.fill();

      if (fw.vy >= 0 && !fw.exploded) {
        fw.exploded = true;
        explode(fw);
        fireworks.splice(i, 1);
      }
    }

    // อัปเดตอนุภาคระเบิด
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.life--;

      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);

      if (p.life <= 0) particles.splice(i, 1);
    }

    frame++;

    if (frame < 1500) {
      requestAnimationFrame(update);
    } else {
      stopCelebration();
    }
  }

  update();
}
function stopCelebration() {
  const canvas = document.getElementById("fireworks");
  const ctx = canvas.getContext("2d");

  if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
  if (fireworksAnimId) cancelAnimationFrame(fireworksAnimId);

  confettiAnimId = null;
  fireworksAnimId = null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.style.display = "none";
}


/* ================= CHAMPION ================= */
socket.on("winner", data => {
  playSound("bingo");   // 🎉 เสียงชนะ
  isWaiting = false;        // ⭐ สำคัญมาก
  startConfetti();
  startFireworks();   // 🎆 พลุ
  showChampion(data);
});

function showChampion(data) {
  // ซ่อนหน้าเกม
  document.getElementById("game").style.display = "none";

  const champ = document.getElementById("champion");
  champ.style.display = "flex";

  // ข้อมูลผู้ชนะ
  document.getElementById("championName").innerText = data.name;
  document.getElementById("championTime").innerText =
    "เวลา " + formatTime(data.time);

  /* ===== LEADERBOARD ===== */
  const lb = document.getElementById("leaderboard");
  lb.innerHTML = "";
  data.leaderboard.forEach(p => {
    const li = document.createElement("li");
    li.innerText = `${p.name} - ${formatTime(p.time)}`;
    lb.appendChild(li);
  });

  /* ===== WIN BOARD ===== */
  const wb = document.getElementById("winBoard");
  wb.innerHTML = "";

  const cells = [];

  // สร้างกระดานผู้ชนะ
  data.winBoard.forEach((c, i) => {
    const div = document.createElement("div");

    if (i === 12) {
      // ⭐ ช่อง FREE ตรงกลาง
      div.className = "win-cell free mark";
      div.innerText = "FREE";
    } else {
      div.className = "win-cell" + (c.marked ? " mark" : "");
      div.innerText = c.number;
    }

    wb.appendChild(div);
    cells.push(div);
  });

  /* ===== ANIMATE WIN LINE ===== */
  if (Array.isArray(data.winLine)) {
    data.winLine.forEach((index, step) => {
      if (!cells[index]) return;

      setTimeout(() => {
        cells[index].classList.add("win-line");
      }, step * 300); // 👈 300ms ดูสวยกว่า 250
    });
  }

  const role = document.getElementById("role");
  if (role) {
    role.innerText = "👑 Host รอบถัดไป";
  }

}



function getBoardSnapshot() {
  return board.map(cell => ({
    number: cell.innerText,
    marked: cell.classList.contains("mark")
  }));
}

function testChampion() {
  startConfetti();
  startFireworks();

  // 🔢 สุ่มเลข 1–50 แล้วเอา 25 ตัว
  const pool = Array.from({ length: 50 }, (_, i) => i + 1)
    .sort(() => Math.random() - 0.5)
    .slice(0, 25);

  // 🏆 เส้นที่ชนะ (ทแยงซ้ายบน → ขวาล่าง)
  const winLine = [0, 6, 12, 18, 24];

  showChampion({
    name: "God",
    time: 67,
    leaderboard: [
      { name: "God", time: 67 },
      { name: "Player2", time: 89 },
      { name: "Player3", time: 120 }
    ],
    winBoard: pool.map((num, i) => ({
      number: num,
      marked: winLine.includes(i)
    })),
    winLine
  });
}

function sendChat() {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  if (!msg) return;

  socket.emit("chat", msg);
  input.value = "";
}

socket.on("chat", data => {
  const box = document.getElementById("chatMessages");
  if (!box) return;

  const div = document.createElement("div");
  div.className = "chatMsg" + (data.name === socket.playerName ? " chatSelf" : "");

  div.innerHTML = `
    <div class="chatName">${data.name}</div>
    <div class="chatText">${data.text}</div>
  `;

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;

  // 🔴 ถ้าแชทปิดอยู่ → โชว์จุดแดง
  if (!chatOpen) {
    document.getElementById("chatNotify").style.display = "block";
  }
});


document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.activeElement.id === "chatInput") {
    sendChat();
  }
});

function toggleChat() {
  const win = document.getElementById("chatWindow");
  const notify = document.getElementById("chatNotify");

  chatOpen = win.style.display !== "flex";
  win.style.display = chatOpen ? "flex" : "none";

  if (chatOpen) {
    notify.style.display = "none"; // เปิดแล้ว = เคลียร์แจ้งเตือน
  }
}

socket.on("waiting", () => {
  isWaiting = true;

  alert("⏳ เกมกำลังเล่นอยู่ กรุณารอรอบถัดไป");

  // ซ่อนปุ่มเล่นทั้งหมด
  document.getElementById("board").style.opacity = "0.4";
  document.getElementById("board").style.pointerEvents = "none";
});

function unlockSound() {
  Object.values(sounds).forEach(a => {
    a.play().then(() => {
      a.pause();
      a.currentTime = 0;
    }).catch(()=>{});
  });
}

// เรียกหลัง user interaction
document.addEventListener("click", unlockSound, { once: true });
let soundEnabled = true;

function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById("soundBtn").innerText = soundEnabled ? "🔊" : "🔇";
}

function playSound(name) {
  if (!soundEnabled) return;
  const a = sounds[name];
  if (!a) return;
  a.currentTime = 0;
  a.play().catch(()=>{});
}

socket.on("roomInfo", data => {
  const box = document.getElementById("roomInfoBox");
  box.style.display = "block";

  document.getElementById("roomName").innerText = data.roomId;
  document.getElementById("playerCount").innerText = data.playerCount;
});

function showPage(page) {
  ["lobby", "game", "champion"].forEach(id => {
    document.getElementById(id).style.display = "none";
  });
  document.getElementById(page).style.display = "block";
}

socket.on("lobbyData", rooms => {
  const list = document.getElementById("lobbyList");

  if (!rooms.length) {
    list.innerHTML = "<p>ยังไม่มีห้อง</p>";
    return;
  }

  list.innerHTML = "";

  rooms.forEach(r => {
    const div = document.createElement("div");
    div.className = "lobby-room";

    div.innerHTML = `
      <strong>ห้อง:</strong> ${r.roomId}<br>
      👥 ${r.players} คน
      ${r.started ? " | 🔴 กำลังเล่น" : " | 🟢 ว่าง"}
    `;

    list.appendChild(div);
  });
});
socket.on("lobbyUpdate", rooms => {
  const list = document.getElementById("lobbyList");
  if (!list) return;

  list.innerHTML = "";

  if (rooms.length === 0) {
    list.innerHTML = "<p>ยังไม่มีห้อง</p>";
    return;
  }

  rooms.forEach(r => {
    const div = document.createElement("div");
    div.className = "lobby-room";

    div.innerHTML = `
      <div class="room-name">🏠 ห้อง ${r.roomId}</div>
      <div class="room-info">
        👥 ${r.players} คน
        ${r.started ? "⏳ กำลังเล่น" : "✅ ว่าง"}
      </div>
    `;

    // ⭐ ตรงนี้คือหัวใจ
    div.onclick = () => selectRoom(r.roomId);

    list.appendChild(div);
  });
});


function selectRoom(roomId) {
  const name = document.getElementById("name").value;

  if (!name) {
    alert("กรุณากรอกชื่อก่อนเข้าห้อง");
    document.getElementById("name").focus();
    return;
  }

  document.getElementById("room").value = roomId;
  join(); // ใช้ระบบ join เดิมของคุณ
  

}

