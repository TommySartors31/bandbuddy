import { hasUsedRankedToday, submitPerformance, getActiveSeason, listMusic, listAssignments, assignmentsForStudent } from "../data.js";
import { Recorder, uploadRecording, uploadRecordingFile, mediaPlayerHTML } from "../storage.js";

export async function render(container, ctx) {
  const { user, profile } = ctx;
  const usedToday = await hasUsedRankedToday(user.uid);
  const season = await getActiveSeason();
  const allMusic = await listMusic();
  const myMusic = allMusic.filter(m => (profile.instruments || []).includes(m.instrument) && m.active !== false);
  const allAssignments = await listAssignments();
  const myAssignments = assignmentsForStudent(allAssignments, { id: user.uid, block: profile.block, instruments: profile.instruments || [] })
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));

  let recorder = null;
  let recordedBlob = null;
  let recordedFile = null;
  let mode = usedToday ? "practice" : "ranked";

  function draw() {
    container.innerHTML = `
      <h2>Ranked</h2>
      <p class="muted">${season ? season.name : "No active season"}</p>

      ${myAssignments.length ? `
        <div class="card section-gap">
          <div class="card-title">Assigned to you</div>
          ${myAssignments.map(a => {
            const m = allMusic.find(x => x.id === a.musicId);
            const overdue = a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10);
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
              <div>${m ? m.title : "Unknown piece"}</div>
              <span class="badge ${overdue ? "pending" : ""}">${a.dueDate ? `Due ${a.dueDate}` : "No due date"}</span>
            </div>`;
          }).join("")}
        </div>
      ` : ""}

      <div class="card section-gap">
        <div class="badge ${usedToday ? "graded" : ""}" style="margin-bottom:12px">
          ${usedToday ? "OFFICIAL RANKED ATTEMPT COMPLETE" : "OFFICIAL RANKED ATTEMPT AVAILABLE"}
        </div>
        ${usedToday ? `<p class="muted">You can still record a practice performance below — it will not affect your RP.</p>` : ""}

        <label>Performance type</label>
        <select id="modeSelect" ${usedToday ? "disabled" : ""}>
          ${!usedToday ? `<option value="ranked">Official Ranked (today's attempt)</option>` : ""}
          <option value="practice" ${usedToday ? "selected" : ""}>Practice (XP only, no RP)</option>
        </select>

        <label>Music piece</label>
        <select id="musicSelect">
          ${myMusic.length ? myMusic.map(m => `<option value="${m.id}">${m.title}</option>`).join("")
            : `<option value="">No music assigned to your instrument yet</option>`}
        </select>
        <div id="sheetLink" style="margin-top:6px"></div>

        <div class="section-gap">
          <button class="btn" id="recBtn">● Start recording</button>
          <span id="recStatus" class="muted" style="margin-left:10px"></span>
        </div>
        <div class="section-gap">
          <label>Or upload a recording or video (e.g. a Voice Memo or video from your iPhone)</label>
          <input id="fileInput" type="file" accept="audio/*,video/*,.m4a,.caf,.mov,.mp4" />
        </div>
        <div id="playback"></div>
        <div id="progress" class="muted" style="margin-top:8px"></div>
        <div class="section-gap">
          <button class="btn primary" id="submitBtn" disabled>Submit performance</button>
        </div>
        <div id="err" class="error-text"></div>
      </div>
    `;

    container.querySelector("#modeSelect")?.addEventListener("change", (e) => mode = e.target.value);
    if (usedToday) mode = "practice"; else mode = "ranked";

    function updateSheetLink() {
      const id = container.querySelector("#musicSelect")?.value;
      const m = myMusic.find(x => x.id === id);
      container.querySelector("#sheetLink").innerHTML = m?.pdfURL
        ? `<a href="${m.pdfURL}" target="_blank" style="color:var(--red-bright)">View sheet music</a>`
        : "";
    }
    updateSheetLink();
    container.querySelector("#musicSelect")?.addEventListener("change", updateSheetLink);

    const recBtn = container.querySelector("#recBtn");
    const submitBtn = container.querySelector("#submitBtn");
    let recording = false;

    recBtn.addEventListener("click", async () => {
      if (!recording) {
        try {
          recorder = new Recorder();
          await recorder.start();
          recording = true;
          recBtn.textContent = "■ Stop recording";
          container.querySelector("#recStatus").textContent = "Recording…";
        } catch {
          container.querySelector("#err").textContent = "Microphone access is required to record. Check your browser permissions.";
        }
      } else {
        recordedBlob = await recorder.stop();
        recordedFile = null;
        container.querySelector("#fileInput").value = "";
        recording = false;
        recBtn.textContent = "● Re-record";
        container.querySelector("#recStatus").textContent = "Recorded.";
        const url = URL.createObjectURL(recordedBlob);
        container.querySelector("#playback").innerHTML = `<audio controls src="${url}"></audio>`;
        submitBtn.disabled = false;
      }
    });

    container.querySelector("#fileInput").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      recordedFile = file;
      recordedBlob = null;
      container.querySelector("#recStatus").textContent = "";
      recBtn.textContent = "● Start recording";
      const url = URL.createObjectURL(file);
      container.querySelector("#playback").innerHTML = mediaPlayerHTML(url, file);
      submitBtn.disabled = false;
    });

    submitBtn.addEventListener("click", async () => {
      submitBtn.disabled = true;
      container.querySelector("#err").textContent = "";
      const musicId = container.querySelector("#musicSelect").value;
      const selectedMode = usedToday ? "practice" : (container.querySelector("#modeSelect")?.value || "ranked");
      try {
        const url = recordedFile
          ? await uploadRecordingFile(recordedFile, user.uid, (pct) => {
              container.querySelector("#progress").textContent = `Uploading… ${pct}%`;
            })
          : await uploadRecording(recordedBlob, user.uid, (pct) => {
              container.querySelector("#progress").textContent = `Uploading… ${pct}%`;
            });
        await submitPerformance({
          uid: user.uid,
          type: selectedMode,
          instrument: (profile.instruments || [])[0] || "Unassigned",
          musicId,
          recordingURL: url,
          seasonId: season?.id
        });
        container.querySelector("#progress").textContent = "";
        container.innerHTML = `
          <h2>Ranked</h2>
          <div class="card">
            <p>${selectedMode === "ranked"
              ? "Your official Ranked performance is submitted and waiting for teacher grading."
              : "Your practice performance was submitted."}</p>
            <a class="btn" href="#/dashboard">Back to dashboard</a>
          </div>`;
      } catch (e) {
        container.querySelector("#err").textContent = e.message || "Something went wrong submitting your performance.";
        submitBtn.disabled = false;
      }
    });
  }

  draw();
}
