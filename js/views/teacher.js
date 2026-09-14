import { getPendingGrades, gradePerformance, listStudents, listMusic, getAuditLog } from "../data.js";
import { renderAssignmentsPanel } from "./shared/assignments-panel.js";
import { mediaPlayerHTML } from "../storage.js";

export async function render(container, ctx, params) {
  const tab = params?.tab || "queue";
  container.innerHTML = `
    <h2>Teacher Panel</h2>
    <div style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap">
      <a class="btn ${tab === "queue" ? "primary" : ""}" href="#/teacher/queue">Pending Grades</a>
      <a class="btn ${tab === "students" ? "primary" : ""}" href="#/teacher/students">Students</a>
      <a class="btn ${tab === "music" ? "primary" : ""}" href="#/teacher/music">Music Library</a>
      <a class="btn ${tab === "assignments" ? "primary" : ""}" href="#/teacher/assignments">Assignments</a>
    </div>
    <div id="body"><p class="muted">Loading…</p></div>
  `;
  const body = container.querySelector("#body");

  if (tab === "assignments") {
    await renderAssignmentsPanel(body, ctx, () => render(container, ctx, params));
    return;
  }

  if (tab === "students") {
    const students = await listStudents();
    body.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Block</th><th>Instruments</th><th>RP</th><th>XP</th><th>Streak</th></tr></thead>
        <tbody>
          ${students.map(s => `<tr>
            <td>${s.displayName}</td><td>${s.block || "—"}</td>
            <td>${(s.instruments || []).join(", ") || "—"}</td>
            <td>${s.currentRP || 0}</td><td>${s.currentSeasonXP || 0}</td><td>🔥 ${s.streak || 0}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
    return;
  }

  if (tab === "music") {
    const music = await listMusic();
    body.innerHTML = `
      <table>
        <thead><tr><th>Title</th><th>Instrument</th><th>Difficulty</th><th>Sheet music</th><th>Status</th></tr></thead>
        <tbody>${music.map(m => `<tr><td>${m.title}</td><td>${m.instrument}</td><td>${m.difficulty || "—"}</td>
          <td>${m.pdfURL ? `<a href="${m.pdfURL}" target="_blank" style="color:var(--red-bright)">View PDF</a>` : "—"}</td>
          <td>${m.active === false ? "Inactive" : "Active"}</td></tr>`).join("")}</tbody>
      </table>`;
    return;
  }

  // default: grading queue
  const pending = await getPendingGrades();
  const students = await listStudents();
  const nameFor = (uid) => students.find(s => s.id === uid)?.displayName || uid;

  body.innerHTML = pending.length ? pending.map(p => `
    <div class="card section-gap">
      <div class="card-title">${p.type.toUpperCase()} ${p.tournamentId ? "· Tournament" : ""}</div>
      <h3>${nameFor(p.uid)}</h3>
      <p class="muted">${p.instrument || ""} · Attempt ${p.attemptNumber || 1}</p>
      ${p.recordingURL ? mediaPlayerHTML(p.recordingURL) : `<p class="muted">No recording attached.</p>`}
      <label>Grade (%)</label>
      <input type="number" min="0" max="100" class="gradeInput" data-id="${p.id}" />
      <label>Feedback (optional)</label>
      <textarea class="fbInput" data-id="${p.id}" rows="2"></textarea>
      <div class="section-gap"><button class="btn primary submitGrade" data-id="${p.id}">Submit grade</button></div>
      <div class="msg muted" data-id="${p.id}" style="margin-top:6px"></div>
    </div>
  `).join("") : `<p class="muted">No performances waiting for grading.</p>`;

  body.querySelectorAll(".submitGrade").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const grade = Number(body.querySelector(`.gradeInput[data-id="${id}"]`).value);
      const feedback = body.querySelector(`.fbInput[data-id="${id}"]`).value;
      const msg = body.querySelector(`.msg[data-id="${id}"]`);
      if (isNaN(grade) || grade < 0 || grade > 100) { msg.textContent = "Enter a grade between 0 and 100."; return; }
      btn.disabled = true;
      try {
        await gradePerformance(id, grade, feedback, ctx.user.uid);
        msg.textContent = "Grade submitted — RP/XP applied.";
        btn.closest(".card").style.opacity = 0.5;
      } catch (e) {
        msg.textContent = e.message;
        btn.disabled = false;
      }
    });
  });
}
