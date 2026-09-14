import { CLOUDINARY_UPLOAD_URL, CLOUDINARY_UPLOAD_PRESET, CLOUDINARY_CLOUD_NAME } from "./cloudinary-config.js";

// Generic uploader — works for audio recordings, PDFs, or images. Cloudinary's
// "auto" endpoint figures out the file type itself, so one function covers
// Ranked/Practice/Tournament recordings AND sheet music PDF uploads.
function uploadToCloudinary(fileOrBlob, filename, folder, onProgress) {
  return new Promise((resolve, reject) => {
    if (CLOUDINARY_CLOUD_NAME === "REPLACE_ME") {
      reject(new Error("File storage isn't configured yet — set up js/cloudinary-config.js."));
      return;
    }
    const form = new FormData();
    form.append("file", fileOrBlob, filename);
    form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    form.append("folder", folder);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", CLOUDINARY_UPLOAD_URL, true);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        resolve(data.secure_url);
      } else {
        reject(new Error("Your file could not be uploaded. Please try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Your file could not be uploaded. Please try again."));
    xhr.send(form);
  });
}

// Uploads a recorded audio Blob and resolves with the public playback URL.
export function uploadRecording(blob, uid, onProgress) {
  return uploadToCloudinary(blob, `${uid}-${Date.now()}.webm`, `recordings/${uid}`, onProgress);
}

// Uploads a sheet music PDF (or image) selected by a Dev/Teacher and
// resolves with its public URL.
export function uploadSheetMusic(file, onProgress) {
  return uploadToCloudinary(file, file.name, "sheetmusic", onProgress);
}

// Uploads a recording a student picked from their device instead of
// recording in-browser — e.g. a higher-quality Voice Memos take from an
// iPhone. Keeps the file's real name/extension (.m4a, etc.) so Cloudinary's
// "auto" endpoint reads its actual container format correctly.
export function uploadRecordingFile(file, uid, onProgress) {
  return uploadToCloudinary(file, `${uid}-${Date.now()}-${file.name}`, `recordings/${uid}`, onProgress);
}

// Picks <video> vs <audio> playback markup for a recording. Pass the File
// object when you have one (upload previews); pass just the URL when you
// only have the stored recordingURL (grading queue) — it falls back to
// guessing from the file extension in that case.
export function mediaPlayerHTML(url, fileOrType) {
  const type = typeof fileOrType === "string" ? fileOrType : (fileOrType?.type || "");
  const isVideo = type.startsWith("video/") || /\.(mp4|mov|m4v|avi|mkv|wmv|3gp)(\?|$)/i.test(url);
  return isVideo
    ? `<video controls style="max-width:100%" src="${url}"></video>`
    : `<audio controls src="${url}"></audio>`;
}

// Simple in-browser recorder wrapper used by the Ranked/Practice/Tournament views.
export class Recorder {
  constructor() {
    this.chunks = [];
    this.mediaRecorder = null;
    this.stream = null;
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => this.chunks.push(e.data);
    this.mediaRecorder.start();
  }
  stop() {
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        this.stream.getTracks().forEach(t => t.stop());
        resolve(new Blob(this.chunks, { type: "audio/webm" }));
      };
      this.mediaRecorder.stop();
    });
  }
}
