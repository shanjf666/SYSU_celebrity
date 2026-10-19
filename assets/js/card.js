(() => {
  "use strict";

  const form = document.getElementById("cardForm");
  const card = document.querySelector(".coda-card");
  if (!form || !card) return;

  const nameInput = document.getElementById("cardName");
  const roleInput = document.getElementById("cardRole");
  const lineInput = document.getElementById("cardLine");
  const preview = document.getElementById("cardPreview");
  const previewImage = document.getElementById("cardPreviewImage");
  const download = document.getElementById("cardDownload");
  const redo = document.getElementById("cardRedo");
  const status = document.getElementById("cardStatus");
  const fallbackName = document.getElementById("fallbackName");
  const fallbackRole = document.getElementById("fallbackRole");
  const fallbackLine = document.getElementById("fallbackLine");

  const STORAGE_KEY = "sysu-archive-card-v1";
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 760;
  const ctx = canvas.getContext ? canvas.getContext("2d") : null;
  if (!ctx) card.classList.add("no-canvas");

  let objectUrl = "";
  let archiveNo = "";
  let hasGenerated = false;

  const pad = (value, length) => String(value).padStart(length, "0");

  function readStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function writeStorage(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* 无存储时仍可生成与下载 */
    }
  }

  function makeArchiveNo() {
    const now = new Date();
    const month = pad(now.getMonth() + 1, 2);
    const day = pad(now.getDate(), 2);
    const random = pad(Math.floor(Math.random() * 9000) + 1000, 4);
    return `SYSU-YOUTH-${now.getFullYear()}${month}${day}-${random}`;
  }

  function seeded(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function wrapText(text, maxWidth) {
    const chars = [...text];
    const lines = [];
    let line = "";
    chars.forEach((char) => {
      const test = line + char;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  function drawStamp(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.075);
    ctx.strokeStyle = "#a63b2d";
    ctx.fillStyle = "#a63b2d";
    ctx.lineWidth = 7;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.lineWidth = 2;
    ctx.strokeRect(-size / 2 + 11, -size / 2 + 11, size - 22, size - 22);
    ctx.font = '600 46px "Songti SC", "SimSun", serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const gap = size * 0.23;
    const chars = ["青", "春", "留", "名"];
    ctx.fillText(chars[0], -gap, -gap);
    ctx.fillText(chars[1], gap, -gap);
    ctx.fillText(chars[2], -gap, gap);
    ctx.fillText(chars[3], gap, gap);
    ctx.restore();
  }

  function drawCard({ name, role, line }) {
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const displayName = name.trim() || "无名追光者";
    const displayLine = line.trim() || "把青春写进更大的事情里。";
    const today = new Date();
    const dateText = `${today.getFullYear()}.${pad(today.getMonth() + 1, 2)}.${pad(
      today.getDate(),
      2
    )}`;
    if (!archiveNo) archiveNo = makeArchiveNo();

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f6f1e8";
    ctx.fillRect(0, 0, width, height);

    const rand = seeded(20261019);
    ctx.save();
    for (let i = 0; i < 1800; i += 1) {
      const x = rand() * width;
      const y = rand() * height;
      const alpha = 0.018 + rand() * 0.028;
      ctx.fillStyle = `rgba(31,29,25,${alpha})`;
      ctx.fillRect(x, y, 1.2, 1.2);
    }
    for (let i = 0; i < 26; i += 1) {
      const y = rand() * height;
      ctx.strokeStyle = `rgba(31,29,25,${0.012 + rand() * 0.018})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y + (rand() - 0.5) * 3);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(31,29,25,.42)";
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 44, width - 88, height - 88);
    ctx.strokeStyle = "rgba(31,29,25,.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(56, 56, width - 112, height - 112);

    ctx.fillStyle = "#4f4a42";
    ctx.font = '500 18px "Cascadia Mono", "Consolas", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("国立中山大学 · 红色人物档案馆", 92, 112);
    ctx.fillText("SYSU · RED ARCHIVE", 92, 140);
    ctx.textAlign = "right";
    ctx.fillText(archiveNo, width - 92, 112);
    ctx.fillText(dateText, width - 92, 140);

    ctx.strokeStyle = "rgba(31,29,25,.28)";
    ctx.beginPath();
    ctx.moveTo(92, 174);
    ctx.lineTo(width - 92, 174);
    ctx.stroke();

    ctx.fillStyle = "#766f65";
    ctx.font = '500 20px "Cascadia Mono", "Consolas", monospace';
    ctx.textAlign = "left";
    ctx.fillText("MY ARCHIVE CARD / 我的档案卡", 92, 224);

    ctx.fillStyle = "#a63b2d";
    ctx.font = '500 24px "Songti SC", "SimSun", serif';
    ctx.fillText("我愿成为", 92, 300);

    ctx.fillStyle = "#1f1d19";
    ctx.font = '600 100px "Songti SC", "SimSun", serif';
    ctx.fillText(displayName, 88, 402);

    ctx.fillStyle = "#4f4a42";
    ctx.font = '400 28px "Songti SC", "SimSun", serif';
    ctx.fillText(role, 94, 452);

    ctx.strokeStyle = "rgba(166,59,45,.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(94, 494);
    ctx.lineTo(480, 494);
    ctx.stroke();

    ctx.fillStyle = "#1f1d19";
    ctx.font = '400 34px "Songti SC", "SimSun", serif';
    const lines = wrapText(displayLine, 760);
    lines.forEach((text, index) => {
      ctx.fillText(text, 94, 556 + index * 52);
    });

    ctx.fillStyle = "#766f65";
    ctx.font = '400 17px "Cascadia Mono", "Consolas", monospace';
    ctx.fillText("青春不是一段年龄，是一次站到光里的选择。", 94, 690);

    drawStamp(width - 172, 600, 132);

    ctx.strokeStyle = "rgba(31,29,25,.28)";
    ctx.beginPath();
    ctx.moveTo(92, 720);
    ctx.lineTo(width - 92, 720);
    ctx.stroke();
    ctx.fillStyle = "#766f65";
    ctx.font = '400 15px "Cascadia Mono", "Consolas", monospace';
    ctx.textAlign = "left";
    ctx.fillText("仅存于你的浏览器 · 不上传", 94, 744);
    ctx.textAlign = "right";
    ctx.fillText("NO. " + archiveNo.slice(-4), width - 94, 744);
  }

  function updateFallback({ name, role, line }) {
    if (fallbackName) fallbackName.textContent = name.trim() || "无名追光者";
    if (fallbackRole) fallbackRole.textContent = role;
    if (fallbackLine) fallbackLine.textContent = line.trim() || "把青春写进更大的事情里。";
  }

  function generate({ persist = true, announce = true } = {}) {
    const values = {
      name: nameInput?.value || "",
      role: roleInput?.value || "求真者",
      line: lineInput?.value || ""
    };
    if (!archiveNo) archiveNo = makeArchiveNo();
    updateFallback(values);
    if (persist) writeStorage({ ...values, archiveNo });

    if (!ctx) {
      if (status) status.textContent = "当前浏览器无法生成图片，已切换为文字档案卡。";
      card.classList.add("no-canvas");
      return;
    }

    drawCard(values);
    canvas.toBlob((blob) => {
      if (!blob) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      if (previewImage) previewImage.src = objectUrl;
      if (download) {
        download.href = objectUrl;
        download.download = `青春留名-${values.name.trim() || "我的档案卡"}.png`;
      }
      preview?.classList.add("is-visible");
      if (announce && status) status.textContent = "档案卡已生成，可保存为 PNG。";
      hasGenerated = true;
    }, "image/png");
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    generate();
  });

  redo?.addEventListener("click", () => {
    preview?.classList.remove("is-visible");
    hasGenerated = false;
    if (status) status.textContent = "可以继续修改，再盖一次章。";
    nameInput?.focus();
  });

  download?.addEventListener("click", () => {
    if (status) status.textContent = "PNG 已开始下载。";
  });

  const saved = readStorage();
  if (saved) {
    if (nameInput) nameInput.value = saved.name || "";
    if (roleInput) roleInput.value = saved.role || "求真者";
    if (lineInput) lineInput.value = saved.line || "";
    archiveNo = saved.archiveNo || makeArchiveNo();
    updateFallback(saved);
    if (ctx) {
      generate({ persist: false, announce: false });
      if (status) status.textContent = "已恢复上次写下的档案卡。";
    }
  }

  [nameInput, roleInput, lineInput].forEach((field) => {
    field?.addEventListener("input", () => {
      updateFallback({
        name: nameInput?.value || "",
        role: roleInput?.value || "求真者",
        line: lineInput?.value || ""
      });
    });
  });

  window.addEventListener("beforeunload", () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
})();
