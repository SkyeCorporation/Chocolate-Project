(function () {
  let isAgentRunning = false;
  let currentFile = null;
  let currentMsgEl = null;
  let currentTextEl = null;
  let pendingToolBlocks = {};
  let pendingImage = null;

  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const btnSend = document.getElementById("btn-send");
  const agentStatus = document.getElementById("agent-status");
  const statusText = agentStatus.querySelector(".status-text");
  const fileTree = document.getElementById("file-tree");
  const checkpointsList = document.getElementById("checkpoints-list");
  const codeEditor = document.getElementById("code-editor");
  const editorPlaceholder = document.getElementById("editor-placeholder");
  const editorFilename = document.getElementById("editor-filename");
  const btnSaveFile = document.getElementById("btn-save-file");
  const logsContent = document.getElementById("logs-content");
  const modalOverlay = document.getElementById("modal-overlay");
  const modalFilename = document.getElementById("modal-filename");

  const isMobile = () => window.innerWidth <= 680;

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const panelId = btn.dataset.panel;
      const tabTarget = btn.dataset.tabTarget;
      switchMobilePanel(panelId);
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (tabTarget) {
        document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabTarget}"]`);
        if (tabBtn) tabBtn.classList.add("active");
        const tabContent = document.getElementById(`tab-${tabTarget}`);
        if (tabContent) tabContent.classList.add("active");
        loadCheckpoints();
      }
    });
  });

  function switchMobilePanel(panelId) {
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active-mobile"));
    const target = document.getElementById(panelId);
    if (target) target.classList.add("active-mobile");
  }

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "checkpoints") loadCheckpoints();
    });
  });

  chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 130) + "px";
  });

  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  btnSend.addEventListener("click", sendMessage);

  const btnAttach = document.getElementById("btn-attach");
  const fileInputImage = document.getElementById("file-input-image");
  const imagePreviewStrip = document.getElementById("image-preview-strip");
  const previewImg = document.getElementById("preview-img");
  const previewLabel = document.getElementById("preview-label");
  const btnRemoveImage = document.getElementById("btn-remove-image");

  btnAttach.addEventListener("click", () => fileInputImage.click());

  fileInputImage.addEventListener("change", () => {
    const file = fileInputImage.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addLog("error", "File harus berupa gambar (jpg, png, gif, webp, dll)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      addLog("error", "Gambar terlalu besar (maks 10MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(",")[1];
      pendingImage = { base64, mimeType: file.type, fileName: file.name, dataUrl };
      previewImg.src = dataUrl;
      previewLabel.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
      imagePreviewStrip.style.display = "flex";
      btnAttach.classList.add("has-image");
      chatInput.placeholder = "Tambah keterangan gambar atau langsung kirim...";
    };
    reader.readAsDataURL(file);
    fileInputImage.value = "";
  });

  btnRemoveImage.addEventListener("click", () => clearPendingImage());

  function clearPendingImage() {
    pendingImage = null;
    imagePreviewStrip.style.display = "none";
    previewImg.src = "";
    previewLabel.textContent = "";
    btnAttach.classList.remove("has-image");
    chatInput.placeholder = "Ketik pesan atau kirim gambar...";
  }

  document.querySelectorAll(".suggestion-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      chatInput.value = btn.dataset.msg;
      if (isMobile()) {
        switchMobilePanel("panel-chat");
        document.querySelectorAll(".nav-btn").forEach(b => {
          b.classList.toggle("active", b.dataset.panel === "panel-chat" && !b.dataset.tabTarget);
        });
      }
      sendMessage();
    });
  });

  document.getElementById("btn-refresh-files").addEventListener("click", loadFileTree);
  document.getElementById("btn-refresh-checkpoints").addEventListener("click", loadCheckpoints);
  document.getElementById("btn-clear-logs").addEventListener("click", () => { logsContent.innerHTML = ""; });
  document.getElementById("btn-clear-history").addEventListener("click", clearHistory);

  document.getElementById("btn-new-file").addEventListener("click", () => {
    modalFilename.value = "";
    modalOverlay.style.display = "flex";
    setTimeout(() => modalFilename.focus(), 50);
  });

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
  document.getElementById("modal-create").addEventListener("click", createNewFile);
  modalFilename.addEventListener("keydown", e => { if (e.key === "Enter") createNewFile(); });

  btnSaveFile.addEventListener("click", saveCurrentFile);

  function closeModal() { modalOverlay.style.display = "none"; }

  async function createNewFile() {
    const filename = modalFilename.value.trim();
    if (!filename) return;
    closeModal();
    try {
      await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filename, content: "" })
      });
      await loadFileTree();
      openFileInEditor(filename, "");
      if (isMobile()) {
        switchMobilePanel("panel-editor");
        document.querySelectorAll(".nav-btn").forEach(b => {
          b.classList.toggle("active", b.dataset.panel === "panel-editor");
        });
      }
    } catch (e) {
      addLog("error", `Gagal buat file: ${e.message}`);
    }
  }

  async function saveCurrentFile() {
    if (!currentFile) return;
    try {
      await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentFile, content: codeEditor.value })
      });
      addLog("success", `Tersimpan: ${currentFile}`);
      await loadFileTree();
    } catch (e) {
      addLog("error", `Gagal simpan: ${e.message}`);
    }
  }

  async function loadFileTree() {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      renderFileTree(data.tree);
    } catch (e) {
      fileTree.innerHTML = `<div class="empty-state">Gagal memuat file</div>`;
    }
  }

  function renderFileTree(tree, container = null, depth = 0) {
    if (!container) {
      fileTree.innerHTML = "";
      container = fileTree;
    }
    if (!tree || tree.length === 0) {
      if (depth === 0) container.innerHTML = `<div class="empty-state">Belum ada file.<br>Minta agent untuk membuat!</div>`;
      return;
    }
    const sorted = [...tree].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const item of sorted) {
      const el = document.createElement("div");
      el.className = `tree-item ${item.type === "directory" ? "dir-item" : ""}`;
      el.style.paddingLeft = `${12 + depth * 14}px`;
      const icon = item.type === "directory"
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>`
        : getFileIcon(item.name);
      const delBtn = item.type === "file" ? `<button class="item-delete" title="Hapus">✕</button>` : "";
      el.innerHTML = `<span class="item-icon">${icon}</span><span class="item-name">${item.name}</span>${delBtn}`;

      if (item.type === "file") {
        if (currentFile === item.path) el.classList.add("active");
        el.addEventListener("click", async (e) => {
          if (e.target.classList.contains("item-delete")) return;
          document.querySelectorAll(".tree-item").forEach(i => i.classList.remove("active"));
          el.classList.add("active");
          try {
            const res = await fetch(`/api/files/read?path=${encodeURIComponent(item.path)}`);
            const data = await res.json();
            openFileInEditor(item.path, data.content || "");
            if (isMobile()) {
              switchMobilePanel("panel-editor");
              document.querySelectorAll(".nav-btn").forEach(b => {
                b.classList.toggle("active", b.dataset.panel === "panel-editor");
              });
            }
          } catch (err) {
            addLog("error", `Gagal baca: ${item.path}`);
          }
        });
        const delBtnEl = el.querySelector(".item-delete");
        if (delBtnEl) {
          delBtnEl.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!confirm(`Hapus ${item.path}?`)) return;
            await fetch(`/api/files?path=${encodeURIComponent(item.path)}`, { method: "DELETE" });
            if (currentFile === item.path) closeEditor();
            await loadFileTree();
            addLog("info", `Dihapus: ${item.path}`);
          });
        }
      } else {
        let expanded = false;
        const childrenEl = document.createElement("div");
        childrenEl.className = "tree-children";
        childrenEl.style.display = "none";
        el.addEventListener("click", () => {
          expanded = !expanded;
          childrenEl.style.display = expanded ? "block" : "none";
        });
        container.appendChild(el);
        renderFileTree(item.children || [], childrenEl, depth + 1);
        container.appendChild(childrenEl);
        continue;
      }
      container.appendChild(el);
    }
  }

  function getFileIcon(name) {
    const ext = name.split(".").pop()?.toLowerCase();
    const colors = { js: "#f7df1e", ts: "#3178c6", json: "#f7df1e", html: "#e34c26", css: "#264de4", scss: "#c6538c", md: "#083fa1", py: "#3776ab", sh: "#89e051", txt: "#8b8fa8", png: "#e91e63", jpg: "#e91e63", svg: "#ff7043", env: "#3ecf8e" };
    const color = colors[ext] || "#8b8fa8";
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="${color}"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7z"/></svg>`;
  }

  function openFileInEditor(path, content) {
    currentFile = path;
    editorFilename.textContent = path;
    codeEditor.value = content;
    editorPlaceholder.style.display = "none";
    codeEditor.style.display = "block";
    btnSaveFile.style.display = "block";
  }

  function closeEditor() {
    currentFile = null;
    editorFilename.textContent = "Tidak ada file";
    codeEditor.style.display = "none";
    editorPlaceholder.style.display = "flex";
    btnSaveFile.style.display = "none";
  }

  async function loadCheckpoints() {
    try {
      const res = await fetch("/api/checkpoints");
      const data = await res.json();
      renderCheckpoints(data.checkpoints);
    } catch (e) {
      checkpointsList.innerHTML = `<div class="empty-state">Gagal memuat</div>`;
    }
  }

  function renderCheckpoints(checkpoints) {
    if (!checkpoints || checkpoints.length === 0) {
      checkpointsList.innerHTML = `<div class="empty-state">Belum ada checkpoint.<br>Minta agent untuk menyimpan!</div>`;
      return;
    }
    checkpointsList.innerHTML = "";
    checkpoints.forEach(cp => {
      const el = document.createElement("div");
      el.className = "checkpoint-card";
      el.innerHTML = `
        <div class="checkpoint-desc">${escHtml(cp.description)}</div>
        <div class="checkpoint-time">${formatTimeAgo(new Date(cp.timestamp))} · ${cp.id.slice(-8)}</div>
        <div class="checkpoint-actions">
          <button class="checkpoint-btn cp-restore" data-id="${cp.id}">Pulihkan</button>
          <button class="checkpoint-btn cp-delete" data-id="${cp.id}">Hapus</button>
        </div>
      `;
      el.querySelector(".cp-restore").addEventListener("click", async () => {
        if (!confirm(`Pulihkan ke: "${cp.description}"?\nWorkspace saat ini akan ditimpa.`)) return;
        try {
          await fetch(`/api/checkpoints/restore/${cp.id}`, { method: "POST" });
          await loadFileTree();
          addLog("success", `Dipulihkan ke: ${cp.description}`);
          appendSystemMessage(`✅ Workspace dipulihkan ke checkpoint: "${cp.description}"`);
          if (currentFile) {
            try {
              const res = await fetch(`/api/files/read?path=${encodeURIComponent(currentFile)}`);
              const data = await res.json();
              if (data.content !== undefined) codeEditor.value = data.content;
            } catch { closeEditor(); }
          }
        } catch (e) { addLog("error", `Gagal pulihkan: ${e.message}`); }
      });
      el.querySelector(".cp-delete").addEventListener("click", async () => {
        if (!confirm("Hapus checkpoint ini?")) return;
        await fetch(`/api/checkpoints/${cp.id}`, { method: "DELETE" });
        await loadCheckpoints();
      });
      checkpointsList.appendChild(el);
    });
  }

  function formatTimeAgo(date) {
    const secs = Math.floor((new Date() - date) / 1000);
    if (secs < 60) return "baru saja";
    if (secs < 3600) return `${Math.floor(secs/60)} mnt lalu`;
    if (secs < 86400) return `${Math.floor(secs/3600)} jam lalu`;
    return date.toLocaleDateString("id");
  }

  async function clearHistory() {
    if (!confirm("Hapus riwayat percakapan?")) return;
    await fetch("/api/history/clear", { method: "POST" });
    chatMessages.innerHTML = "";
    appendSystemMessage("Riwayat percakapan dihapus.");
  }

  async function handleImagineCommand(prompt) {
    appendUserMessage(`/imagine ${prompt}`);
    const agentEl = document.createElement("div");
    agentEl.className = "message";
    agentEl.innerHTML = `
      <div class="message-header">
        <div class="message-avatar agent-avatar">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
        </div>
        <span class="message-role">Rem AI Agent</span>
      </div>
      <div class="message-body">
        <div class="message-text imagine-status">🎨 Membuat gambar: <em>${escHtml(prompt)}</em>...</div>
      </div>`;
    chatMessages.appendChild(agentEl);
    scrollToBottom();
    setStatus("running", "Membuat gambar...");
    addLog("info", `🎨 /imagine ${prompt}`);
    try {
      const res = await fetch(`/api/imagine?prompt=${encodeURIComponent(prompt)}`);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error(`Server error (${res.status}) — respons bukan JSON`);
      }
      const data = await res.json();
      const body = agentEl.querySelector(".message-body");
      if (data.success && data.imageData) {
        body.innerHTML = `
          <div class="imagine-result">
            <div class="imagine-label">🎨 <em>${escHtml(prompt)}</em></div>
            <img src="data:${data.mimeType};base64,${data.imageData}" alt="${escHtml(prompt)}" class="generated-image">
          </div>`;
        addLog("success", `✓ Gambar berhasil dibuat`);
      } else {
        body.innerHTML = `<div class="message-text" style="color:var(--red)">❌ Gagal: ${escHtml(data.error || "Unknown error")}</div>`;
        addLog("error", `✗ Gagal: ${data.error}`);
      }
    } catch (e) {
      agentEl.querySelector(".message-body").innerHTML = `<div class="message-text" style="color:var(--red)">❌ Error: ${escHtml(e.message)}</div>`;
      addLog("error", `Error: ${e.message}`);
    }
    setStatus("idle", "Siap");
    scrollToBottom();
  }

  async function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg && !pendingImage) return;
    if (isAgentRunning) return;

    chatInput.value = "";
    chatInput.style.height = "auto";

    const imgToSend = pendingImage;
    clearPendingImage();

    const imagineMatch = msg.match(/^\/imagine\s+(.+)$/i);
    if (imagineMatch && !imgToSend) {
      return handleImagineCommand(imagineMatch[1].trim());
    }

    if (isMobile()) {
      switchMobilePanel("panel-chat");
      document.querySelectorAll(".nav-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.panel === "panel-chat" && !b.dataset.tabTarget);
      });
    }

    appendUserMessage(msg, imgToSend);
    startAgentMessage();

    isAgentRunning = true;
    btnSend.disabled = true;
    setStatus("thinking", "Berpikir...");

    const logLabel = msg ? msg.slice(0, 60) + (msg.length > 60 ? "..." : "") : `[Gambar: ${imgToSend?.fileName}]`;
    addLog("info", `→ ${logLabel}`);

    const body = { message: msg };
    if (imgToSend) {
      body.imageData = imgToSend.base64;
      body.mimeType = imgToSend.mimeType;
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              handleAgentEvent(event);
            } catch {}
          }
        }
      }
    } catch (e) {
      appendTextToAgent(`\n\n[Koneksi error: ${e.message}]`);
      setStatus("error", "Error");
      addLog("error", `Error: ${e.message}`);
    } finally {
      isAgentRunning = false;
      btnSend.disabled = false;
      finalizeAgentMessage();
      await loadFileTree();
    }
  }

  function handleAgentEvent(event) {
    switch (event.type) {
      case "status":
        setStatus(getStatusClass(event.text), event.text);
        break;
      case "text":
        appendTextToAgent(event.text);
        break;
      case "tool_call":
        appendToolCall(event.name, event.args);
        addLog("tool", `⚡ ${event.name}(${formatArgs(event.args)})`);
        break;
      case "tool_result":
        finalizeToolCall(event.name, event.result);
        const isOk = event.result?.success !== false;
        addLog(isOk ? "success" : "error", `  ${isOk ? "✓" : "✗"} ${event.name}: ${getResultPreview(event.result)}`);
        if (event.name === "createCheckpoint" && isOk) loadCheckpoints();
        break;
      case "generated_image":
        appendGeneratedImage(event.imageData, event.mimeType, event.prompt);
        break;
      case "done":
        setStatus("done", "Selesai");
        break;
      case "error":
        appendTextToAgent(`\n\n[Error: ${event.message}]`);
        setStatus("error", "Error");
        addLog("error", `Error: ${event.message}`);
        break;
    }
  }

  function getStatusClass(text) {
    if (!text) return "idle";
    const t = text.toLowerCase();
    if (t.includes("pikir") || t.includes("think") || t.includes("analiz")) return "thinking";
    if (t.includes("run") || t.includes("tool") || t.includes("eksekusi") || t.includes("analisis")) return "running";
    if (t.includes("selesai") || t.includes("done")) return "done";
    if (t.includes("error")) return "error";
    return "running";
  }

  function setStatus(cls, text) {
    agentStatus.className = `status-indicator ${cls}`;
    statusText.textContent = text;
  }

  function appendUserMessage(text, img) {
    const el = document.createElement("div");
    el.className = "message";
    let imgHtml = "";
    if (img) {
      imgHtml = `<img src="${img.dataUrl}" alt="sent image" class="user-sent-image">`;
    }
    el.innerHTML = `
      <div class="message-header">
        <div class="message-avatar user-avatar">U</div>
        <span class="message-role">Kamu</span>
      </div>
      <div class="message-body">
        ${img ? imgHtml : ""}
        ${text ? `<div class="message-text">${escHtml(text)}</div>` : ""}
      </div>`;
    chatMessages.appendChild(el);
    scrollToBottom();
  }

  function startAgentMessage() {
    currentMsgEl = document.createElement("div");
    currentMsgEl.className = "message";
    currentMsgEl.innerHTML = `
      <div class="message-header">
        <div class="message-avatar agent-avatar">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
        </div>
        <span class="message-role">Rem AI Agent</span>
      </div>
      <div class="message-body"></div>`;
    chatMessages.appendChild(currentMsgEl);
    currentTextEl = null;
    scrollToBottom();
  }

  let rawTextBuffer = "";

  function appendTextToAgent(text) {
    if (!currentMsgEl) startAgentMessage();
    const body = currentMsgEl.querySelector(".message-body");
    if (!currentTextEl) {
      currentTextEl = document.createElement("div");
      currentTextEl.className = "message-text";
      body.appendChild(currentTextEl);
      rawTextBuffer = "";
    }
    rawTextBuffer += text;
    currentTextEl.innerHTML = renderMarkdown(rawTextBuffer);
    scrollToBottom();
  }

  function appendGeneratedImage(imageData, mimeType, prompt) {
    if (!currentMsgEl) startAgentMessage();
    const body = currentMsgEl.querySelector(".message-body");
    currentTextEl = null;
    rawTextBuffer = "";
    const imgDiv = document.createElement("div");
    imgDiv.className = "imagine-result";
    imgDiv.innerHTML = `
      <div class="imagine-label">🎨 <em>${escHtml(prompt || "generated image")}</em></div>
      <img src="data:${mimeType || "image/png"};base64,${imageData}" alt="${escHtml(prompt || "generated image")}" class="generated-image">`;
    body.appendChild(imgDiv);
    scrollToBottom();
  }

  function appendToolCall(name, args) {
    if (!currentMsgEl) startAgentMessage();
    const body = currentMsgEl.querySelector(".message-body");
    currentTextEl = null;
    rawTextBuffer = "";

    const blockId = `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const block = document.createElement("div");
    block.className = "tool-block";
    block.id = blockId;
    const argPreview = formatArgs(args);
    block.innerHTML = `
      <div class="tool-block-header">
        <span class="tool-name-badge">⚡ ${escHtml(name)}</span>
        <span class="tool-arg-preview">${escHtml(argPreview)}</span>
        <span class="tool-chevron">▶</span>
      </div>
      <div class="tool-block-body">
        <div class="tool-section-label">Arguments</div>
        <div class="tool-json">${escHtml(JSON.stringify(args, null, 2))}</div>
        <div class="tool-section-label">Result</div>
        <div class="tool-result-content">
          <div class="typing-indicator"><span></span><span></span><span></span></div>
        </div>
      </div>`;
    block.querySelector(".tool-block-header").addEventListener("click", () => block.classList.toggle("expanded"));
    body.appendChild(block);
    pendingToolBlocks[name] = block;
    scrollToBottom();
  }

  function finalizeToolCall(name, result) {
    const block = pendingToolBlocks[name];
    if (!block) return;
    delete pendingToolBlocks[name];
    const isOk = result?.success !== false;
    block.classList.add(isOk ? "success" : "error");
    const resultContent = block.querySelector(".tool-result-content");
    if (resultContent) {
      const preview = getResultPreview(result);
      const cls = isOk ? "tool-success" : "tool-error";
      const full = JSON.stringify(result, null, 2);
      resultContent.innerHTML = `<div class="${cls}">${escHtml(preview)}</div><div class="tool-json" style="margin-top:4px">${escHtml(full.slice(0, 600))}</div>`;
    }
    const badge = block.querySelector(".tool-name-badge");
    if (badge) badge.textContent = `${isOk ? "✓" : "✗"} ${name}`;
    scrollToBottom();
  }

  function finalizeAgentMessage() {
    if (currentMsgEl) {
      const body = currentMsgEl.querySelector(".message-body");
      if (!body.hasChildNodes()) {
        const p = document.createElement("div");
        p.className = "message-text";
        p.style.color = "var(--text-muted)";
        p.textContent = "Selesai.";
        body.appendChild(p);
      }
    }
    currentMsgEl = null;
    currentTextEl = null;
    rawTextBuffer = "";
    pendingToolBlocks = {};
    setTimeout(() => setStatus("idle", "Siap"), 2000);
  }

  function appendSystemMessage(text) {
    const el = document.createElement("div");
    el.className = "message";
    el.innerHTML = `<div class="message-body" style="padding-left:0"><div class="message-text" style="color:var(--text-muted);font-size:12px;font-style:italic">${escHtml(text)}</div></div>`;
    chatMessages.appendChild(el);
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  function addLog(type, msg) {
    const el = document.createElement("div");
    el.className = `log-line ${type}`;
    const time = new Date().toLocaleTimeString("id", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    el.textContent = `[${time}] ${msg}`;
    logsContent.appendChild(el);
    logsContent.scrollTop = logsContent.scrollHeight;
  }

  function formatArgs(args) {
    if (!args) return "";
    const entries = Object.entries(args);
    if (entries.length === 0) return "";
    const first = entries[0];
    let val = String(first[1]);
    if (val.length > 40) val = val.slice(0, 40) + "...";
    return `${first[0]}: ${val}`;
  }

  function getResultPreview(result) {
    if (!result) return "null";
    if (result.error) return `Error: ${result.error}`;
    if (result.message) return result.message;
    if (result.content) return result.content.slice(0, 80) + (result.content.length > 80 ? "..." : "");
    if (result.stdout) return result.stdout.slice(0, 80);
    if (result.items) return `${result.items.length} items`;
    if (result.checkpoints) return `${result.checkpoints.length} checkpoints`;
    if (result.checkpoint) return `Checkpoint: ${result.checkpoint.description}`;
    return result.success ? "OK" : "Failed";
  }

  function escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderMarkdown(text) {
    if (!text) return "";
    let html = escHtml(text);
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code>${code.trim()}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/^#{1,3}\s+(.+)$/gm, "<strong>$1</strong>");
    html = html.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");
    html = html.replace(/\n/g, "<br>");
    return html;
  }

  loadFileTree();
})();
