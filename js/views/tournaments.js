import { listTournaments, createTournament, isEligible, getTournamentAttempts, submitPerformance, getLeaderboard, getTournamentLeaderboard } from "../data.js";
import { Recorder, uploadRecording, uploadRecordingFile, mediaPlayerHTML } from "../storage.js";
import { INSTRUMENTS } from "../firebase-config.js";

export async function render(container, ctx) {
  const { user, profile } = ctx;
  const canCreate = profile.role === "teacher" || profile.role === "dev";
  const tournaments = await listTournaments();

  const overall = await getLeaderboard(null);
  const mine = overall.find(s => s.id === user.uid);
  const studentForCheck = { id: user.uid, division: mine?.division || 2, instruments: profile.instruments || [] };

  container.innerHTML = `
    <h2>Tournaments</h2>
    ${canCreate ? `<div class="section-gap"><button class="btn primary" id="newTourneyBtn">+ Create tournament</button></div><div id="createForm"></div>` : ""}
    <div class="grid grid-2 section-gap" id="list"></div>
  `;

  const listEl = container.querySelector("#list");
  if (!tournaments.length) {
    listEl.innerHTML = `<p class="muted">No tournaments posted yet.</p>`;
  } else {
    for (const t of tournaments) {
      const eligible = isEligible(t, studentForCheck);
      const attempts = await getTournamentAttempts(t.id, user.uid);
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `
        <div class="card-title">${t.format === "duos" ? "DUOS" : "SOLO"}</div>
        <h3>${t.name}</h3>
        <p class="muted" style="font-size:0.9rem">${t.description || ""}</p>
        ${t.prizeText ? `<p><strong>Prize:</strong> ${t.prizeText}</p>` : ""}
        <p class="muted" style="font-size:0.85rem">${attempts.length}/${t.attemptsAllowed || 3} attempts used</p>
        ${!eligible ? `<span class="badge">Not eligible</span>` :
          attempts.length >= (t.attemptsAllowed || 3)
            ? `<span class="badge graded">All attempts used</span>`
            : `<button class="btn" data-id="${t.id}" data-attempt="${attempts.length + 1}">Record attempt ${attempts.length + 1}</button>`}
        <div class="tourney-record" data-for="${t.id}"></div>
        <button class="btn" style="margin-top:10px" data-lb="${t.id}">View leaderboard</button>
        <div class="tourney-lb" data-lbfor="${t.id}"></div>
      `;
      listEl.appendChild(div);
    }

    listEl.querySelectorAll("button[data-id]").forEach(btn => {
      btn.addEventListener("click", () => openRecordUI(btn.dataset.id, Number(btn.dataset.attempt)));
    });
    listEl.querySelectorAll("button[data-lb]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const slot = listEl.querySelector(`.tourney-lb[data-lbfor="${btn.dataset.lb}"]`);
        if (slot.dataset.open === "true") { slot.innerHTML = ""; slot.dataset.open = "false"; return; }
        slot.innerHTML = `<p class="muted">Loading…</p>`;
        const entries = await getTournamentLeaderboard(btn.dataset.lb);
        slot.dataset.open = "true";
        slot.innerHTML = entries.length ? entries.map(e => `
          <div class="lb-row ${e.rank <= 3 ? "top3" : ""}">
            <div class="lb-rank ${e.rank <= 3 ? "gold-txt" : ""}">#${e.rank}</div>
            <div class="lb-name">${e.name}<div class="lb-sub">${e.attempts} attempt${e.attempts === 1 ? "" : "s"} graded</div></div>
            <div class="lb-rp">${e.total}</div>
          </div>`).join("") : `<p class="muted">No graded attempts yet.</p>`;
      });
    });
  }

  function openRecordUI(tournamentId, attemptNumber) {
    const slot = listEl.querySelector(`.tourney-record[data-for="${tournamentId}"]`);
    let recorder, blob, file;
    slot.innerHTML = `
      <div class="section-gap">
        <button class="btn" id="rec">● Start recording</button>
        <div id="pb"></div>
        <div class="section-gap">
          <label>Or upload a recording or video (e.g. a Voice Memo or video from your iPhone)</label>
          <input id="fileInput" type="file" accept="audio/*,video/*,.m4a,.caf,.mov,.mp4" />
        </div>
        <button class="btn primary" id="sub" disabled style="margin-top:8px">Submit attempt ${attemptNumber}</button>
        <div id="err" class="error-text"></div>
      </div>`;
    let recording = false;
    slot.querySelector("#rec").addEventListener("click", async () => {
      if (!recording) {
        recorder = new Recorder();
        await recorder.start();
        recording = true;
        slot.querySelector("#rec").textContent = "■ Stop";
      } else {
        blob = await recorder.stop();
        file = null;
        slot.querySelector("#fileInput").value = "";
        recording = false;
        slot.querySelector("#rec").textContent = "● Re-record";
        slot.querySelector("#pb").innerHTML = `<audio controls src="${URL.createObjectURL(blob)}"></audio>`;
        slot.querySelector("#sub").disabled = false;
      }
    });
    slot.querySelector("#fileInput").addEventListener("change", (e) => {
      const picked = e.target.files[0];
      if (!picked) return;
      file = picked;
      blob = null;
      slot.querySelector("#rec").textContent = "● Start recording";
      slot.querySelector("#pb").innerHTML = mediaPlayerHTML(URL.createObjectURL(file), file);
      slot.querySelector("#sub").disabled = false;
    });
    slot.querySelector("#sub").addEventListener("click", async () => {
      try {
        const url = file ? await uploadRecordingFile(file, user.uid) : await uploadRecording(blob, user.uid);
        await submitPerformance({
          uid: user.uid, type: "tournament", instrument: (profile.instruments || [])[0],
          recordingURL: url, tournamentId, attemptNumber
        });
        slot.innerHTML = `<p class="muted">Attempt submitted — waiting for grading.</p>`;
      } catch (e) {
        slot.querySelector("#err").textContent = e.message;
      }
    });
  }

  if (canCreate) {
    container.querySelector("#newTourneyBtn").addEventListener("click", () => {
      const formEl = container.querySelector("#createForm");
      formEl.innerHTML = `
        <div class="card section-gap">
          <label>Name</label><input id="tName" />
          <label>Description</label><textarea id="tDesc" rows="2"></textarea>
          <label>Prize (text)</label><input id="tPrize" />
          <label>Format</label>
          <select id="tFormat"><option value="solo">Solo</option><option value="duos">Duos</option></select>
          <label>Attempts allowed</label><input id="tAttempts" type="number" value="3" />
          <label>Eligible divisions</label>
          <div style="display:flex;gap:14px">
            <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="d1" style="width:auto"/> Division 1</label>
            <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="d2" style="width:auto"/> Division 2</label>
          </div>
          <label>Eligible instruments (leave all unchecked = everyone)</label>
          <div class="grid grid-2" style="gap:6px">
            ${INSTRUMENTS.map(i => `<label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" class="tInstr" value="${i}" style="width:auto"/> ${i}</label>`).join("")}
          </div>
          <div class="section-gap"><button class="btn primary" id="tSubmit">Create tournament</button></div>
        </div>
      `;
      formEl.querySelector("#tSubmit").addEventListener("click", async () => {
        const divisions = [];
        if (formEl.querySelector("#d1").checked) divisions.push(1);
        if (formEl.querySelector("#d2").checked) divisions.push(2);
        const instruments = [...formEl.querySelectorAll(".tInstr:checked")].map(c => c.value);
        await createTournament({
          name: formEl.querySelector("#tName").value,
          description: formEl.querySelector("#tDesc").value,
          prizeText: formEl.querySelector("#tPrize").value,
          format: formEl.querySelector("#tFormat").value,
          attemptsAllowed: Number(formEl.querySelector("#tAttempts").value) || 3,
          eligibility: { divisions, instruments, studentIds: [] }
        }, user.uid);
        render(container, ctx);
      });
    });
  }
}
